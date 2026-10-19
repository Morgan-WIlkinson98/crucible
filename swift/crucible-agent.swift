// crucible-agent — macOS helper for Crucible.
// Responsibilities:
//   1. Watch global mouse events via CGEventTap: detect drag start, read the
//      system drag pasteboard for file URLs, report key taps during the drag
//      (shift/ctrl/cmd), and report drop position on mouse-up.
//   2. Handle stdin commands (JSON lines): share / airdrop / ocr / ping.
//   3. OCR via the Vision framework.
//
// Protocol (stdout, one JSON object per line):
//   {"event":"ready","inputMonitoring":true}
//   {"event":"dragstart","files":["/path/a.png",...]}
//   {"event":"key","key":"shift"|"ctrl"|"cmd"|"option"}
//   {"event":"drop","x":123.0,"y":456.0}
//   {"event":"dragend"}            // drop happened w/o wheel or drag aborted
//   {"event":"result","id":..,"ok":true,"text":".."}  // command responses
//   {"event":"error","message":".."}
//
// Requires Input Monitoring permission for the event tap.

import Cocoa
import Vision
import IOKit.hid

// Private CoreGraphics SPI for space-type inspection (used by many window tools;
// stable in practice, fails safe to "not fullscreen" if unavailable)
@_silgen_name("CGSMainConnectionID") func CGSMainConnectionID() -> Int32
@_silgen_name("CGSGetActiveSpace") func CGSGetActiveSpace(_ cid: Int32) -> UInt64
@_silgen_name("CGSSpaceGetType") func CGSSpaceGetType(_ cid: Int32, _ space: UInt64) -> Int32

func activeSpaceIsFullscreen() -> Bool {
    let conn = CGSMainConnectionID()
    return CGSSpaceGetType(conn, CGSGetActiveSpace(conn)) == 4  // kCGSSpaceFullscreen
}

func emitSpace() {
    emit(["event": "space", "fullscreen": activeSpaceIsFullscreen()])
}

let stdout = FileHandle.standardOutput
func emit(_ obj: [String: Any]) {
    if let d = try? JSONSerialization.data(withJSONObject: obj) {
        stdout.write(d)
        stdout.write("\n".data(using: .utf8)!)
    }
}

// ---------------------------------------------------------------- drag state
enum DragState { case idle, maybeDrag, dragging }
var dragState: DragState = .idle
var mouseDownPoint = CGPoint.zero
var dragFiles: [String] = []
var dragEndedByWheel = false   // set when a wheel was opened for this drag

func dragPasteboardFiles() -> [String] {
    let pb = NSPasteboard(name: .drag)
    let opts: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
    if let urls = pb.readObjects(forClasses: [NSURL.self], options: opts) as? [URL] {
        return urls.filter { $0.isFileURL }.map { $0.path }
    }
    // fallback: legacy filenames type
    if let names = pb.propertyList(forType: NSPasteboard.PasteboardType("NSFilenamesPboardType")) as? [String] {
        return names
    }
    return []
}

func modifierFor(keyCode: UInt16, flags: CGEventFlags) -> String? {
    switch Int(keyCode) {
    case 56, 60: return flags.contains(.maskShift)   ? "shift"  : nil
    case 59, 62: return flags.contains(.maskControl) ? "ctrl"   : nil
    case 55, 54: return flags.contains(.maskCommand) ? "cmd"    : nil
    case 58, 61: return flags.contains(.maskAlternate) ? "option" : nil
    case 53:     return "escape"
    default:     return nil
    }
}

func eventCallback(proxy: CGEventTapProxy, type: CGEventType,
                   event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    switch type {
    case .leftMouseDown:
        dragState = .maybeDrag
        mouseDownPoint = event.location
        dragFiles = []

    case .leftMouseDragged:
        if dragState == .maybeDrag {
            let dx = abs(event.location.x - mouseDownPoint.x)
            let dy = abs(event.location.y - mouseDownPoint.y)
            if dx + dy > 8 {
                dragState = .dragging
                dragFiles = dragPasteboardFiles()
                if !dragFiles.isEmpty {
                    emit(["event": "dragstart", "files": dragFiles,
                          "x": event.location.x, "y": event.location.y])
                }
            }
        }

    case .leftMouseUp:
        if dragState == .dragging && !dragFiles.isEmpty {
            emit(["event": "drop", "x": event.location.x, "y": event.location.y])
        }
        dragState = .idle
        dragFiles = []

    case .flagsChanged:
        if dragState == .dragging {
            if let key = modifierFor(keyCode: UInt16(event.getIntegerValueField(.keyboardEventKeycode)),
                                     flags: event.flags) {
                if key == "escape" {
                    emit(["event": "cancel"])
                } else {
                    emit(["event": "key", "key": key])
                }
            }
        }

    case .keyDown:
        if dragState == .dragging &&
            event.getIntegerValueField(.keyboardEventKeycode) == 53 {
            emit(["event": "cancel"])
        }

    case .tapDisabledByTimeout, .tapDisabledByUserInput:
        // re-enable — taps get disabled if the callback stalls
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: true)
        }
    default:
        break
    }
    return Unmanaged.passUnretained(event)
}

var eventTap: CFMachPort?

func startEventTap() -> Bool {
    let mask: CGEventMask =
        (1 << CGEventType.leftMouseDown.rawValue) |
        (1 << CGEventType.leftMouseDragged.rawValue) |
        (1 << CGEventType.leftMouseUp.rawValue) |
        (1 << CGEventType.flagsChanged.rawValue) |
        (1 << CGEventType.keyDown.rawValue)

    guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap,
                                      place: .headInsertEventTap,
                                      options: .listenOnly,
                                      eventsOfInterest: mask,
                                      callback: eventCallback,
                                      userInfo: nil) else {
        return false
    }
    eventTap = tap
    let src = CFMachPortCreateRunLoopSource(nil, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    return true
}

// ---------------------------------------------------------------- commands
func ocrImage(_ file: String) throws -> String {
    guard let img = NSImage(contentsOfFile: file),
          let tiff = img.tiffRepresentation,
          let bmp = NSBitmapImageRep(data: tiff),
          let cg = bmp.cgImage else {
        throw msg("Could not load image")
    }
    var out = ""
    var err: Error?
    let sema = DispatchSemaphore(value: 0)
    let req = VNRecognizeTextRequest { request, e in
        if let results = request.results as? [VNRecognizedTextObservation] {
            out = results.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        }
        err = e
        sema.signal()
    }
    req.recognitionLevel = .accurate
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    sema.wait()
    if let err { throw err }
    return out
}

func msg(_ s: String) -> NSError {
    NSError(domain: "crucible-agent", code: 1, userInfo: [NSLocalizedDescriptionKey: s])
}

var shareWindow: NSWindow?

func shareFiles(_ files: [String], service: String?) {
    let urls = files.map { URL(fileURLWithPath: $0) }
    if service == "airdrop" {
        guard let svc = NSSharingService(named: .sendViaAirDrop) else {
            emit(["event": "error", "message": "AirDrop unavailable"])
            return
        }
        svc.perform(withItems: urls)
        emit(["event": "result", "ok": true])
        return
    }
    // generic share sheet: transient 1px window at the mouse
    DispatchQueue.main.async {
        let pt = NSEvent.mouseLocation
        let win = NSWindow(contentRect: NSRect(x: pt.x, y: pt.y, width: 1, height: 1),
                           styleMask: .borderless, backing: .buffered, defer: false)
        win.level = .floating
        win.isOpaque = false
        win.makeKeyAndOrderFront(nil)
        shareWindow = win
        let picker = NSSharingServicePicker(items: urls)
        picker.show(relativeTo: .zero, of: win.contentView!, preferredEdge: .minY)
        // keep the window alive long enough for a selection
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
            shareWindow?.orderOut(nil)
            shareWindow = nil
        }
        emit(["event": "result", "ok": true])
    }
}

func handleCommand(_ line: String) {
    guard let data = line.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let cmd = obj["cmd"] as? String else { return }
    do {
        switch cmd {
        case "ping":
            emit(["event": "result", "ok": true])
        case "ocr":
            let file = obj["file"] as? String ?? ""
            let text = try ocrImage(file)
            emit(["event": "result", "ok": true, "text": text])
        case "share":
            shareFiles((obj["files"] as? [String]) ?? [], service: obj["service"] as? String)
        case "quit":
            exit(0)
        default:
            emit(["event": "error", "message": "unknown cmd \(cmd)"])
        }
    } catch {
        emit(["event": "error", "message": error.localizedDescription])
    }
}

// ---------------------------------------------------------------- main
let access = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)
let granted = (access == kIOHIDAccessTypeGranted)
if !granted {
    // triggers the Input Monitoring prompt; user must relaunch after granting
    _ = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
}

DispatchQueue.global().async {
    while let line = readLine(strippingNewline: true) {
        handleCommand(line)
    }
}

// report space fullscreen state on every space switch
NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.activeSpaceDidChangeNotification,
    object: nil, queue: .main) { _ in emitSpace() }

emit(["event": "ready", "inputMonitoring": granted,
      "fullscreen": activeSpaceIsFullscreen()])
if granted {
    if startEventTap() {
        emit(["event": "listening"])
    } else {
        emit(["event": "error", "message": "CGEventTap failed"])
    }
}
CFRunLoopRun()
