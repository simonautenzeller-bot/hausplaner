param([int]$Port = 8126)

$roots = @{
  'hausplaner'   = 'C:\Users\NQ00175681\OneDrive - Telefonica\Desktop\TEF\Claude\hausplaner'
  'finanzen-app' = 'C:\Users\NQ00175681\OneDrive - Telefonica\Desktop\TEF\github\finanzen-app'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving multi-app origin on http://localhost:$Port/ (same origin, mimics GitHub Pages same-account layout)"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    $segments = $path.TrimStart('/').Split('/', 2)
    $prefix = $segments[0]
    $rest = if ($segments.Length -gt 1) { $segments[1] } else { '' }
    if ($rest -eq '') { $rest = 'index.html' }

    if ($roots.ContainsKey($prefix)) {
      $filePath = Join-Path $roots[$prefix] $rest
      if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $ct = $mime[$ext]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentType = $ct
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $path")
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } else {
      $res.StatusCode = 200
      $listing = ($roots.Keys | ForEach-Object { "<li><a href=`"/$_/`">/$_/</a></li>" }) -join ''
      $html = "<html><body><h1>Apps</h1><ul>$listing</ul></body></html>"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
      $res.ContentType = 'text/html; charset=utf-8'
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
