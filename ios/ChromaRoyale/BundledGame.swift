import Foundation
import WebKit

/// A local origin lets module scripts and fetch load the same bundled web game offline.
final class BundledGame: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.url(forResource: "www", withExtension: nil)?.resolvingSymlinksInPath()
    private let mime = ["html": "text/html", "js": "text/javascript", "css": "text/css",
                        "json": "application/json", "webmanifest": "application/manifest+json",
                        "png": "image/png", "webp": "image/webp", "svg": "image/svg+xml"]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let root, let url = task.request.url,
              url.scheme == "chroma", url.host == "game",
              task.request.httpMethod == nil || task.request.httpMethod == "GET" else {
            task.didFailWithError(URLError(.unsupportedURL)); return
        }
        let path = url.path == "/" || url.path.isEmpty ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), let type = mime[file.pathExtension.lowercased()] else {
            task.didFailWithError(URLError(.noPermissionsToReadFile)); return
        }
        do {
            let data = try Data(contentsOf: file, options: .mappedIfSafe)
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
                "Content-Type": type, "Content-Length": String(data.count),
                "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff"
            ])!
            task.didReceive(response); task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }

    // Reads above are synchronous, so no pending work survives a cancellation.
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
