# Image Annotator

A Node.js web application for annotating images with direct filesystem integration.

## Features

- **Node.js image serving**: Images are served directly from your local file system via HTTP endpoints
- Automatic detection of corresponding .txt annotation files in the same directory
- Real-time annotation editing with auto-save on blur
- Secure path validation to prevent directory traversal attacks
- Support for quoted paths (automatically removes " or ' characters)
- Full path handling for images in different directories
- Responsive interface using Bulma CSS framework

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter the path to your image directory in the input field
   - You can paste paths enclosed in quotes (e.g., `"/Users/yourname/Pictures/images"`)
   - The app automatically removes the quotes
2. Click "Scan Directory"
3. The application will automatically detect all images and their corresponding .txt files
4. Edit annotations directly in the text areas
5. Annotations are automatically saved when you click away (onBlur)

## File Structure

- `server.js` - Node.js backend server with filesystem integration
- `public/index.html` - Main HTML file with Bulma CSS
- `uploads/` - Directory for storing annotations (images remain in their original location)

## How It Works

### Directory Scanning Mode
1. Enter a directory path (e.g., `/Users/yourname/Pictures/images`)
2. Backend scans the directory for image files
3. For each image, checks if a corresponding .txt file exists in the same directory
4. If found, loads the annotation text into the textarea
5. When you finish editing (onBlur), saves the annotation to the same directory

### Image Serving
- Images are served via HTTP endpoints (`/image/{fullPath}`)
- Node.js reads the image file from disk and streams it to the browser
- Correct Content-Type headers are set for each image format

## Security Features

- Path traversal protection (prevents accessing files outside allowed directories)
- Only allows access to directories within the app root or user's home directory
- Input validation for all file paths
- Automatic quote removal from path inputs

## API Endpoints

### POST /api/scandir
Scans a directory for images and their annotations.
Body: `{ "directoryPath": "/path/to/images" }`

### POST /api/annotations
Saves annotation for an image.
Body: `{ "directoryPath": "/path/to/images", "imageFile": "filename.jpg", "annotation": "text" }`

### GET /api/images
Returns list of all images with their annotations from the uploads directory (legacy).

### GET /image/*
Serves image files from any allowed directory.

## Notes

- Images are served via HTTP endpoints, not loaded directly from file:// protocol
- Node.js reads image files from disk and streams them with correct Content-Type headers
- Only annotations (.txt files) are stored in the `uploads/` directory
- The app expects annotation files to have the same base name as the image (e.g., `photo.jpg` → `photo.txt`)
- To clear all annotations, delete the contents of the `uploads/` directory

## macOS Specific Notes

- You can use Finder to get directory paths (right-click → "Get Info" or drag folder from Finder to terminal)
- Paths are case-sensitive on macOS
- Ensure the Node.js process has read/write permissions to your image directories
- Paths can be pasted with quotes (e.g., from Finder) - the app automatically removes them

## How Image Serving Works

When you scan a directory, the app creates image elements like:
```html
<img src="/image/%2FUsers%2Flojza%2FDownloads%2FLoRA%20Training%20Set%2Fimage.jpg">
```

The browser requests this URL, and Node.js:
1. Decodes the path from URL encoding
2. Validates security (prevents directory traversal)
3. Reads the image file from disk using `fs.createReadStream()`
4. Sets correct Content-Type header (e.g., `image/jpeg`, `image/png`)
5. Streams the image data directly to the browser
