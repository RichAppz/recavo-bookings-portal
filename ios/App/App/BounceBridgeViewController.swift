import UIKit
import Capacitor

/// Capacitor switches off the web view's rubber-band scrolling
/// (`scrollView.bounces = false`) so hybrid apps feel less like web pages.
/// We want the opposite: native overscroll bounce, and the room it gives the
/// web layer to implement pull-to-refresh at the top of every page.
class BounceBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let scrollView = webView?.scrollView else { return }
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.alwaysBounceHorizontal = false
    }
}
