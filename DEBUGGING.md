# Debugging Image Display Issues

## How to Test

1. **Start the server with verbose logging:**
   ```bash
   cd /Users/lojza/Projects/ImageAnnotator
   npm start 2>&1 | tee server.log
   ```

2. **Scan a directory with images**

3. **Check the server log** for entries like:
   - `Scanning directory: /path/to/images`
   - `Files found: 5`
   - `Image request: /Users/lojza/Downloads/LoRA...jpg`
   - `Decoded path: /Users/lojza/Downloads/LoRA...jpg`
   - `Resolved path: /Users/lojza/Downloads/LoRA...jpg`
   - `Serving image: /Users/lojza/Downloads/LoRA...jpg`

## Common Issues

### Issue: Images show "Image not found"

**Possible causes:**
1. Path resolution is failing
2. Directory permissions issue
3. File doesn't exist at the resolved path

**Debug steps:**
1. Check server log for "Image not found" messages
2. Verify the path in the log matches the actual file location
3. Check if the Node.js process has read permissions for the directory

### Issue: Images don't load but no error in console

**Possible causes:**
1. Content-Type header issue
2. Stream error not being caught
3. Browser caching

**Debug steps:**
1. Check browser developer tools (Network tab)
2. Look for 404 errors or content-type issues
3. Try clearing browser cache

## Fixing Path Issues on macOS

If paths with spaces aren't working:

1. **In the browser console**, check what path is being sent to `/image/*`
2. **Verify the path format** - macOS paths with spaces should be URL-encoded
3. **Test manually** by visiting: `http://localhost:3000/image/{encoded-path}`

## Example Path Format

For a file at `/Users/lojza/Downloads/LoRA Training Set/image.jpg`:

The browser should request: `/image/%2FUsers%2Flojza%2FDownloads%2FLoRA%20Training%20Set%2Fimage.jpg`

The server should:
1. Decode the path to `/Users/lojza/Downloads/LoRA Training Set/image.jpg`
2. Resolve it to the absolute path
3. Check if the file exists
4. Serve the image with correct content-type
