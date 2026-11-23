import CoreHaptics
import UIKit
import WebKit

/// Only the bundled main game document can request short, semantic feedback.
final class HapticBridge: NSObject, WKScriptMessageHandler {
    static let available = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()
    private var lastImpact = -Double.infinity
    private var lastPriority = 0

    static var capabilityScript: String {
        """
        if (location.protocol === 'chroma:' && location.hostname === 'game') {
          Object.defineProperty(window, 'chromaNativeCapabilities', {
            value: Object.freeze({ haptics: \(available ? "true" : "false") }),
            writable: false, configurable: false
          });
        }
        """
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "chromaHaptics", message.frameInfo.isMainFrame,
              let page = message.frameInfo.request.url,
              page.scheme == "chroma", page.host == "game",
              page.path == "/index.html" || page.path == "/",
              let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
        if kind == "cancel" { lastImpact = -Double.infinity; lastPriority = 0; return }
        guard Self.available, UIApplication.shared.applicationState == .active,
              let raw = body["intensity"] as? NSNumber, raw.doubleValue.isFinite else { return }
        let intensity = CGFloat(min(1, max(0, raw.doubleValue)))
        let priorities = ["button": 1, "select": 1, "swap": 2, "reject": 2, "land": 1,
                          "match": 3, "create": 4, "shuffle": 3, "propeller": 4,
                          "rocket": 5, "arrow": 5, "hammer": 6, "tnt": 7, "cannon": 7,
                          "lightball": 6, "win": 8, "lose": 6]
        guard let priority = priorities[kind] else { return }
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastImpact >= 0.055 || priority > lastPriority else { return }
        lastImpact = now; lastPriority = priority
        switch kind {
        case "button", "select": selection.selectionChanged(); selection.prepare()
        case "land": soft.impactOccurred(intensity: intensity); soft.prepare()
        case "swap", "reject": light.impactOccurred(intensity: intensity); light.prepare()
        case "match", "shuffle", "propeller": medium.impactOccurred(intensity: intensity); medium.prepare()
        case "create", "rocket", "arrow", "hammer", "lightball": rigid.impactOccurred(intensity: intensity); rigid.prepare()
        case "tnt", "cannon": heavy.impactOccurred(intensity: intensity); heavy.prepare()
        case "win": notification.notificationOccurred(.success); notification.prepare()
        case "lose": soft.impactOccurred(intensity: intensity); soft.prepare()
        default: break
        }
    }
}
