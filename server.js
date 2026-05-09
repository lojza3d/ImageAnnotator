const express = require('express');
const path = require('path');
const fsSync = require('node:fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

const fs = require('fs');
const pathModule = require('path');

// Read system prompt
const SYSTEM_PROMPT_PATH = pathModule.join(__dirname, 'annotate_system_prompt.md');
let systemPrompt = 'You are an image annotation assistant. Provide a comma-separated list of keywords describing the image.';
try {
  systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
} catch (err) {
  console.warn('annotate_system_prompt.md not found, using default system prompt.');
}

// Helper function to clean directory path (remove quotes)
function cleanPath(dirPath) {
  if (!dirPath) return '';

  // Remove surrounding quotes (both single and double)
  let cleaned = dirPath.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
}

// API endpoint to get images from a directory
app.post('/api/scandir', async (req, res) => {
  try {
    let { directoryPath } = req.body;

    if (!directoryPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }

    // Clean the path (remove quotes)
    directoryPath = cleanPath(directoryPath);

    if (!directoryPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }

    // Security check - prevent directory traversal
    const resolvedPath = path.resolve(directoryPath);
    const appRoot = path.resolve(__dirname);

    // Only allow directories within the app root or user's home directory
    const allowedPaths = [appRoot, process.env.HOME];

    if (!allowedPaths.some(allowed => resolvedPath.startsWith(allowed))) {
      return res.status(403).json({ error: 'Access denied to this directory' });
    }

    // Check if directory exists
    try {
      fsSync.accessSync(resolvedPath);
    } catch (err) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    // Get all files in directory
    const files = fsSync.readdirSync(resolvedPath);

    // Filter for image files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    // For each image, check if corresponding txt file exists
    const imagesWithAnnotations = await Promise.all(
      imageFiles.map(async (imageFile) => {
        const baseName = path.basename(imageFile, path.extname(imageFile));
        const txtFile = `${baseName}.txt`;
        const txtPath = path.join(resolvedPath, txtFile);

        let annotation = '';
        try {
          fsSync.accessSync(txtPath);
          annotation = fsSync.readFileSync(txtPath, 'utf8');
        } catch (err) {
          // File doesn't exist or can't be read
        }

        return {
          image: {
            name: imageFile,
            fullPath: path.join(resolvedPath, imageFile)
          },
          fullPath: path.join(resolvedPath, imageFile),
          annotation: annotation
        };
      })
    );

    res.json({
      directory: resolvedPath,
      images: imagesWithAnnotations
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan directory' });
  }
});

// API endpoint to save annotation
app.post('/api/annotations', async (req, res) => {
  try {
    let directoryPath = req.body.directoryPath;
    let imageFile = req.body.imageFile;
    const annotation = req.body.annotation;

    if (!directoryPath || !imageFile) {
      return res.status(400).json({ error: 'Directory path and image file name are required' });
    }

    // Clean the directory path
    let cleanedPath = cleanPath(directoryPath);
    if (cleanedPath) {
      directoryPath = cleanedPath;
    }

    // Security check
    const resolvedPath = path.resolve(directoryPath);
    const appRoot = path.resolve(__dirname);

    if (!resolvedPath.startsWith(appRoot) && !resolvedPath.startsWith(process.env.HOME)) {
      return res.status(403).json({ error: 'Access denied to this directory' });
    }

    const txtFileName = `${path.basename(imageFile, path.extname(imageFile))}.txt`;
    const txtFilePath = path.join(resolvedPath, txtFileName);

    // Write annotation to txt file
    fsSync.writeFileSync(txtFilePath, annotation, 'utf8');

    res.json({ success: true, message: 'Annotation saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save annotation' });
  }
});

// Serve images from any directory
app.get('/image/*', (req, res) => {
  // Extract the path from the URL
  const encodedPath = req.params[0];

  try {
    // Decode the path (URL-encoded)
    const decodedPath = decodeURIComponent(encodedPath);

    // Security check - prevent directory traversal
    const resolvedPath = path.resolve(decodedPath);
    const appRoot = path.resolve(__dirname);

    // Only allow directories within the app root or user's home directory
    const allowedPaths = [appRoot, process.env.HOME];

    if (!allowedPaths.some(allowed => resolvedPath.startsWith(allowed))) {
      return res.status(403).send('Access denied');
    }

    // Check if file exists
    try {
      fsSync.accessSync(resolvedPath);
    } catch (err) {
      return res.status(404).send('Image not found');
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);

    // Stream the file
    const readStream = fsSync.createReadStream(resolvedPath);
    readStream.pipe(res);

    readStream.on('error', (err) => {
      res.status(500).send('Error reading image');
    });
  } catch (error) {
    res.status(500).send('Error serving image');
  }
});

// API endpoint to get existing images from uploads directory (legacy)
app.get('/api/images', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');

    // Check if uploads directory exists
    try {
      fsSync.accessSync(uploadsDir);
    } catch (err) {
      return res.json({ images: [] });
    }

    const files = fsSync.readdirSync(uploadsDir);

    // Filter for image files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    // For each image, check if corresponding txt file exists
    const imagesWithAnnotations = await Promise.all(
      imageFiles.map(async (imageFile) => {
        const baseName = path.basename(imageFile, path.extname(imageFile));
        const txtFile = `${baseName}.txt`;
        const txtPath = path.join(uploadsDir, txtFile);

        let annotation = '';
        try {
          fsSync.accessSync(txtPath);
          annotation = fsSync.readFileSync(txtPath, 'utf8');
        } catch (err) {
          // File doesn't exist or can't be read
        }

        return {
          image: {
            name: imageFile,
            fullPath: path.join(uploadsDir, imageFile)
          },
          fullPath: path.join(uploadsDir, imageFile),
          annotation: annotation
        };
      })
    );

    res.json({ images: imagesWithAnnotations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Serve uploads directory as static
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API endpoint for LLM models
app.get('/api/llm/models', async (req, res) => {
  try {
    const llmEndpoint = req.query.endpoint || 'http://localhost:1234';
    const modelsUrl = `${llmEndpoint.trim()}/v1/models`;
    const response = await fetch(modelsUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch models from LM Studio' });
    }
    const data = await response.json();
    console.log('LM Studio response:', JSON.stringify(data, null, 2));
    const models = (data.data || []).map(m => ({
      display_name: m.id || m.display_name || 'Unknown',
      loaded: Array.isArray(m.loaded_instances) && m.loaded_instances.length > 0
    }));
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// API endpoint to load a model
app.post('/api/llm/load', async (req, res) => {
  try {
    const { model, endpoint, context_length, flash_attention, echo_load_config } = req.body;
    const llmEndpoint = endpoint || 'http://localhost:1234';
    const loadUrl = `${llmEndpoint.trim()}/api/v1/models/load`;

    const payload = { model, echo_load_config: echo_load_config || false };
    if (context_length) payload.context_length = context_length;
    if (flash_attention !== undefined) payload.flash_attention = flash_attention;

    const response = await fetch(loadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errorData.error || `LM Studio returned status ${response.status}` });
    }

    const data = await response.json();
    console.log('Model load response:', JSON.stringify(data, null, 2));
    res.json(data);
  } catch (error) {
    console.error('Error loading model:', error);
    res.status(500).json({ error: 'Failed to load model' });
  }
});

// API endpoint to annotate an image
app.post('/api/llm/annotate', async (req, res) => {
  try {
    const { model, endpoint, imagePath, prompt } = req.body;
    const llmEndpoint = endpoint || 'http://localhost:1234';
    const chatUrl = `${llmEndpoint.trim()}/api/v1/chat`;

    // Read the image file
    const resolvedPath = pathModule.resolve(imagePath);
    if (!resolvedPath.startsWith(pathModule.resolve(process.env.HOME || '/')) && !resolvedPath.startsWith(pathModule.resolve(__dirname))) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }

    let imageBuffer;
    try {
      imageBuffer = fs.readFileSync(resolvedPath);
    } catch (err) {
      return res.status(404).json({ error: 'Image file not found' });
    }

    const base64Image = imageBuffer.toString('base64');
    const ext = pathModule.extname(resolvedPath).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';

    // Construct input
    const promptInput = {
      type: 'text',
      content: 'Describe the key elements of this image.'
    };

    const imageInput = {
      type: 'image',
      data_url: `data:${mimeType};base64,${base64Image}`
    };

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        input: [promptInput, imageInput],
        system_prompt: systemPrompt,
        context_length: 8192,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errorData.error || `LM Studio returned status ${response.status}` });
    }

    const data = await response.json();

    // Extract content from output
    const message = data.output?.find(item => item.type === 'message');
    if (!message || !message.content) {
      return res.status(500).json({ error: 'No text content found in LLM response' });
    }

    // Post-process: split by comma, trim, deduplicate, join
    const keywords = message.content.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    const uniqueKeywords = [...new Set(keywords)];
    const result = uniqueKeywords.join(', ');

    res.json({ success: true, result: result, imagePath: imagePath, model_instance_id: data.model_instance_id });
  } catch (error) {
    console.error('Error annotating image:', error);
    res.status(500).json({ error: 'Failed to annotate image' });
  }
});

// API endpoint to unload a model
app.post('/api/llm/unload', async (req, res) => {
  try {
    const { endpoint, instance_id } = req.body;
    const llmEndpoint = endpoint || 'http://localhost:1234';
    const unloadUrl = `${llmEndpoint.trim()}/api/v1/models/unload`;

    const response = await fetch(unloadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errorData.error || `LM Studio returned status ${response.status}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error unloading model:', error);
    res.status(500).json({ error: 'Failed to unload model' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('Image Annotator running at http://localhost:' + PORT);
});
