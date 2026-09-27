import Foundation
import AppKit
import Vision
import PDFKit

let args = CommandLine.arguments
func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}
if args.count < 3 { fail("usage: vision pdf-text <pdf> | ocr <image> | redact <image> <out> <boxes-json>") }
let mode = args[1]
let path = args[2]

if mode == "pdf-text" {
  guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { fail("cannot open pdf") }
  var pages: [String] = []
  for i in 0..<doc.pageCount { pages.append(doc.page(at: i)?.string ?? "") }
  print(pages.joined(separator: "\n\u{0C}\n"))
  exit(0)
}

guard let image = NSImage(contentsOfFile: path), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fail("cannot open image") }

if mode == "ocr" {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  request.recognitionLanguages = ["en-US", "tr-TR"]
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
  var lines: [[String: Any]] = []
  for obs in request.results ?? [] {
    guard let cand = obs.topCandidates(1).first else { continue }
    let text = cand.string
    var words: [[String: Any]] = []
    var searchStart = text.startIndex
    for word in text.split(separator: " ", omittingEmptySubsequences: true) {
      guard let range = text.range(of: String(word), range: searchStart..<text.endIndex) else { continue }
      searchStart = range.upperBound
      let box = (try? cand.boundingBox(for: range))?.boundingBox ?? obs.boundingBox
      let start = text.distance(from: text.startIndex, to: range.lowerBound)
      words.append(["start": start, "length": word.count, "box": [box.origin.x, box.origin.y, box.size.width, box.size.height]])
    }
    lines.append(["text": text, "box": [obs.boundingBox.origin.x, obs.boundingBox.origin.y, obs.boundingBox.size.width, obs.boundingBox.size.height], "words": words])
  }
  let data = try! JSONSerialization.data(withJSONObject: lines)
  print(String(data: data, encoding: .utf8)!)
  exit(0)
}

if mode == "redact" {
  if args.count < 5 { fail("redact needs <out> <boxes-json>") }
  let out = args[3]
  let boxes = (try? JSONSerialization.jsonObject(with: args[4].data(using: .utf8)!)) as? [[Double]] ?? []
  let w = CGFloat(cg.width), h = CGFloat(cg.height)
  let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
  ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
  for b in boxes where b.count == 4 {
    let pad: CGFloat = 2
    ctx.fill(CGRect(x: CGFloat(b[0]) * w - pad, y: CGFloat(b[1]) * h - pad, width: CGFloat(b[2]) * w + 2 * pad, height: CGFloat(b[3]) * h + 2 * pad))
  }
  let result = ctx.makeImage()!
  let rep = NSBitmapImageRep(cgImage: result)
  let isJpeg = out.lowercased().hasSuffix(".jpg") || out.lowercased().hasSuffix(".jpeg")
  guard let png = rep.representation(using: isJpeg ? .jpeg : .png, properties: [:]) else { fail("encode failed") }
  try! png.write(to: URL(fileURLWithPath: out))
  exit(0)
}
fail("unknown mode")