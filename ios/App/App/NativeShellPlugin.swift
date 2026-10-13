import Capacitor
import UIKit
import UserNotifications

/// The app's own bridge methods, for what no stock Capacitor plugin covers.
/// The web side is `NativeShell` in src/lib/native.ts.
@objc(NativeShellPlugin)
public class NativeShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeShellPlugin"
    public let jsName = "NativeShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBadgeCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    /// The page has rendered, so the launch cover can lift now rather than
    /// wait for the document to finish streaming.
    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            (self.bridge?.viewController as? AppViewController)?.pageIsReady()
        }
        call.resolve()
    }

    /// The number on the app icon: the unread count the bell shows. Pushes
    /// set it too (the server sends the count in `aps.badge`); this is what
    /// clears it once the alerts have been read in the app.
    @objc func setBadgeCount(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        if #available(iOS 16.0, *) {
            // Without notification permission there is no badge to set; that
            // is not an error worth surfacing to the page.
            UNUserNotificationCenter.current().setBadgeCount(count) { _ in call.resolve() }
        } else {
            DispatchQueue.main.async {
                UIApplication.shared.applicationIconBadgeNumber = count
                call.resolve()
            }
        }
    }

    /// Opens this app's page in Settings — the only way back for someone who
    /// once declined notifications, since iOS never asks twice.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let target: String
            if #available(iOS 16.0, *) {
                target = UIApplication.openNotificationSettingsURLString
            } else {
                target = UIApplication.openSettingsURLString
            }
            guard let url = URL(string: target) else {
                call.reject("Settings are unavailable")
                return
            }
            UIApplication.shared.open(url) { opened in
                if opened { call.resolve() } else { call.reject("Settings could not be opened") }
            }
        }
    }
}
