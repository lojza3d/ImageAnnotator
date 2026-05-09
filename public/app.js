// State object - holds all application state
const AppState = {
  currentImages: [],
  currentDirectory: '',
  keywordCounts: {}, // { keyword: count }
  selectedTile: null,
  selectedTextarea: null,
  llmEndpoint: 'http://localhost:1234'
};

// Tab state
let currentTab = 'keywords';

function switchTab(tabName) {
  currentTab = tabName;

  const keywordTabs = document.querySelectorAll('#annotation-mode .tabs li');
  const keywordContent = document.getElementById('keyword-tab-content');
  const llmContent = document.getElementById('llm-tab-content');

  if (tabName === 'keywords') {
    keywordTabs[0].classList.add('is-active');
    keywordTabs[1].classList.remove('is-active');
    keywordContent.style.display = 'block';
    llmContent.style.display = 'none';
  } else {
    keywordTabs[0].classList.remove('is-active');
    keywordTabs[1].classList.add('is-active');
    keywordContent.style.display = 'none';
    llmContent.style.display = 'block';
  }
}

// DOM elements cache
const DOM = {
  directoryPathInput: document.getElementById('directory-path'),
  scanBtn: document.getElementById('scan-btn'),
  imageContainer: document.getElementById('image-container'),
  loadingOverlay: document.getElementById('loading-overlay'),
  initialModeDiv: document.getElementById('initial-mode'),
  annotationModeDiv: document.getElementById('annotation-mode'),
  keywordChipsContainer: document.getElementById('keyword-chips-container'),
  llmEndpointInput: document.getElementById('llm-endpoint'),
  previewOverlay: document.getElementById('image-preview-overlay')
};

// Load existing images on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadImages();

  // Event listeners
  DOM.scanBtn.addEventListener('click', handleScanDirectory);
  DOM.llmEndpointInput.addEventListener('input', (e) => {
    AppState.llmEndpoint = e.target.value;
  });

  // Tab switching
  const tabHeaders = document.querySelectorAll('#annotation-mode .tabs li');
  tabHeaders[0].addEventListener('click', () => switchTab('keywords'));
  tabHeaders[1].addEventListener('click', () => switchTab('llm'));

  // Get models button
  const getModelsBtn = document.getElementById('get-models-btn');
  if (getModelsBtn) {
    getModelsBtn.addEventListener('click', async () => {
      // Hide the second part of the form when refreshing models
      const annotationSection = document.getElementById('llm-annotation-section');
      if (annotationSection) {
        annotationSection.style.display = 'none';
      }

      getModelsBtn.classList.add('is-loading');
      try {
        const response = await fetch(`/api/llm/models?endpoint=${encodeURIComponent(AppState.llmEndpoint)}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        renderModelsList(data);
      } catch (error) {
        const listEl = document.getElementById('llm-models-list');
        listEl.innerHTML = `<p class="has-text-danger">Error: ${escapeHtml(error.message)}</p>`;
        // Hide the second part of the form on error as well
        document.getElementById('llm-annotation-section').style.display = 'none';
      } finally {
        getModelsBtn.classList.remove('is-loading');
      }
    });
  }

  // Show the second part of the form when a model is selected
  const modelsList = document.getElementById('llm-models-list');
  if (modelsList) {
    modelsList.addEventListener('change', (e) => {
      if (e.target.type === 'radio' && e.target.checked) {
        document.getElementById('llm-annotation-section').style.display = 'block';
      }
    });
  }

  // Start annotating images button
  const startAnnotatingBtn = document.getElementById('start-annotating-btn');
  if (startAnnotatingBtn) {
    startAnnotatingBtn.addEventListener('click', async () => {
      // Get selected model
      const selectedRadio = document.querySelector('input[name="selected-llm-model"]:checked');
      if (!selectedRadio) {
        alert('Please select a model first.');
        return;
      }

      const selectedModel = selectedRadio.value;

      // Get annotation mode
      const annotationModeRadio = document.querySelector('input[name="llm-annotation-mode"]:checked');
      const annotationMode = annotationModeRadio ? annotationModeRadio.value : 'add';

      startAnnotatingBtn.classList.add('is-loading');
      startAnnotatingBtn.disabled = true;

      try {
        const response = await fetch('/api/llm/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            endpoint: AppState.llmEndpoint,
            echo_load_config: true
          })
        });

        const data = await response.json();

        if (data.error) {
          alert('Error loading model: ' + data.error);
          return;
        }

        if (data.status === 'loaded') {
          // Store model info for the next step
          AppState.selectedLlmModel = selectedModel;
          AppState.llmAnnotationMode = annotationMode;
          AppState.isAnnotating = true;

          alert('Model loaded successfully. Starting annotation loop...');
          // TODO: Start the annotation loop here
        } else {
          alert('Model loading failed: ' + JSON.stringify(data));
        }
      } catch (error) {
        console.error('Error loading model:', error);
        alert('Failed to load model: ' + error.message);
      } finally {
        startAnnotatingBtn.classList.remove('is-loading');
        startAnnotatingBtn.disabled = false;
      }
    });
  }
});

// Switch to annotation mode
function switchToAnnotationMode() {
  DOM.initialModeDiv.style.display = 'none';
  DOM.annotationModeDiv.style.display = 'block';
}

function setSelection(tile) {
  // If selecting the same tile, do nothing to avoid redundant work
  if (AppState.selectedTile === tile) {
    return;
  }

  // 1. Deselect previous tile if it exists
  if (AppState.selectedTile) {
    AppState.selectedTile.classList.remove('is-primary');
    AppState.selectedTile.classList.remove('has-background-success-light');
    AppState.selectedTextarea?.classList.remove('is-success');
  }

  // 2. Update AppState and selection info
  AppState.selectedTile = tile;
  if (tile) {
    AppState.selectedTextarea = tile.querySelector('.annotation-text');
    // 3. Highlight new tile
    tile.classList.add('is-primary');
    tile.classList.add('has-background-success-light');
    AppState.selectedTextarea?.classList.add('is-success');
  } else {
    AppState.selectedTextarea = null;
  }

  // 4. Always trigger chip highlight update to ensure UI consistency
  highlightChipsForSelectedTextarea();
}

// Extract keywords from annotation text
function extractKeywords(annotation) {
  if (!annotation || !annotation.trim()) return [];

  const keywords = annotation.split(',').map(k => k.trim()).filter(k => k);
  return keywords;
}

// Update keyword counts based on all annotations
function updateKeywordCounts() {
  const newKeywordCounts = {};

  AppState.currentImages.forEach((item) => {
    const annotation = item.annotation || '';
    extractKeywords(annotation).forEach(keyword => {
      newKeywordCounts[keyword] = (newKeywordCounts[keyword] || 0) + 1;
    });
  });

  for (const keyword in newKeywordCounts) {
    AppState.keywordCounts[keyword] = newKeywordCounts[keyword];
  }

  return Object.keys(newKeywordCounts).sort();
}

// Render keyword chips
function renderKeywordChips() {
  const container = DOM.keywordChipsContainer;
  const sortedKeywords = updateKeywordCounts();

  if (sortedKeywords.length === 0) {
    container.innerHTML = '<p class="has-text-grey">No keywords found in annotations</p>';
    return;
  }

  let html = '';
  sortedKeywords.forEach(keyword => {
    const count = AppState.keywordCounts[keyword];
    html += `
      <div class="keyword-chip" data-keyword="${escapeHtml(keyword)}">
        ${escapeHtml(keyword)}
        <span class="keyword-chip-count">${count}</span>
      </div>`;
  });

  container.innerHTML = html;

  // Add click handlers to chips
  document.querySelectorAll('.keyword-chip').forEach(chip => {
    chip.addEventListener('click', handleChipClick);
  });

  // Ensure newly rendered chips are immediately synchronized with the current selection
  highlightChipsForSelectedTextarea();
}

// Highlight chips based on selected textarea
function highlightChipsForSelectedTextarea() {
  const chips = document.querySelectorAll('.keyword-chip');

  if (AppState.selectedTextarea) {
    const annotation = AppState.selectedTextarea.value;
    const focusedKeywords = extractKeywords(annotation);

    chips.forEach(chip => {
      const keyword = chip.dataset.keyword;

      if (focusedKeywords.includes(keyword)) {
        chip.classList.add('highlighted');
      } else {
        chip.classList.remove('highlighted');
      }
    });
  }
}

// Save annotation for a specific textarea
async function saveAnnotation(textarea) {
  const imageFileEncoded = textarea.dataset.image;
  const fullPathEncoded = textarea.dataset.fullpath;
  const annotation = textarea.value;

  // Decode the filename
  const imageFile = decodeURIComponent(imageFileEncoded);

  // Get full path if available
  let directoryPath = AppState.currentDirectory;
  if (fullPathEncoded) {
    const fullPath = decodeURIComponent(fullPathEncoded);

    // Extract directory from full path using string manipulation
    if (fullPath) {
      const lastSlash = fullPath.lastIndexOf('/');
      if (lastSlash > -1) {
        directoryPath = fullPath.substring(0, lastSlash);
      }
    }
  }

  // Show saving indicator
  const saveStatus = textarea.previousElementSibling?.querySelector('.save-status');
  if (saveStatus) {
    saveStatus.textContent = 'Saving...';
    saveStatus.style.color = '#3273dc';
  }

  try {
    const response = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directoryPath: directoryPath,
        imageFile: imageFile,
        annotation: annotation
      })
    });

    const data = await response.json();

    if (data.success) {
      // Update annotation in currentImages
      const imageFileKey = decodeURIComponent(imageFileEncoded);
      const imageIndex = AppState.currentImages.findIndex(img => img.image?.name === imageFileKey || img.fullPath.includes(imageFileKey));
      if (imageIndex > -1) {
        AppState.currentImages[imageIndex].annotation = annotation;
      }

      // Show success indicator
      if (saveStatus) {
        saveStatus.style.color = '#48c774';
        saveStatus.textContent = 'Saved';
        setTimeout(() => {
          saveStatus.textContent = '';
        }, 2000);
      }

      // Refresh chips after successful save
      renderKeywordChips();
    } else {
      if (saveStatus) {
        saveStatus.textContent = 'Error saving';
        saveStatus.style.color = '#ff3860';
      }
    }
  } catch (error) {
    console.error('Error saving annotation:', error);

    if (saveStatus) {
      saveStatus.textContent = 'Error saving';
      saveStatus.style.color = '#ff3860';
    }
  }
}

// Handle chip click
function handleChipClick(e) {
  const chip = e.currentTarget;
  const keyword = chip.dataset.keyword;

  // Ensure a textarea is selected; otherwise do nothing.
  if (!AppState.selectedTextarea) {
    return;
  }

  // Grab the current annotation and split it into a clean keyword array.
  let annotation = AppState.selectedTextarea.value.trim();
  const keywords = extractKeywords(annotation);   // actual list of keywords

  // Determine whether the keyword is already present.
  const hasKeyword = keywords.includes(keyword);

  if (hasKeyword) {
    // ---- Remove the keyword ----
    const index = keywords.indexOf(keyword);
    if (index > -1) {
      keywords.splice(index, 1);               // remove one occurrence
    }
    // Re‑join the array back into a string (preserve existing comma style)
    annotation = keywords.join(', ');
  } else {
    // ---- Add the keyword (avoid duplicates) ----
    if (!keywords.includes(keyword)) {
      // Ensure proper comma spacing: add ", " only if there is already content.
      const separator = annotation ? ', ' : '';
      annotation += separator + keyword;
    }
  }

  // Update the textarea value.
  AppState.selectedTextarea.value = annotation;

  // Dispatch an input event so any UI that depends on the textarea's content
  // (e.g., chip highlighting) is refreshed automatically.
  const inputEvent = new Event('input', { bubbles: true });
  AppState.selectedTextarea.dispatchEvent(inputEvent);

  // Persist the annotation and re‑highlight chips based on the new content.
  saveAnnotation(AppState.selectedTextarea);
  highlightChipsForSelectedTextarea();
}

// Handle textarea input (update highlights)
function handleTextAreaInput(e) {
  highlightChipsForSelectedTextarea();
}

// Handle textarea blur (save and update chips)
async function handleTextAreaBlur(e) {
  const textarea = e.target;

  // Save annotation
  await saveAnnotation(textarea);
}

// Handle tile click (select the tile)
function handleTileClick(e) {
  setSelection(e.currentTarget);
}

// Load existing images and their annotations from server
async function loadImages() {
  showLoading(true);

  try {
    const response = await fetch('/api/images');

    if (response.ok) {
      const data = await response.json();
      AppState.currentImages = data.images;

      if (AppState.currentImages.length > 0) {
        switchToAnnotationMode();
        renderKeywordChips();
      }

      renderImageTiles(AppState.currentImages);
    }
  } catch (error) {
    console.error('Error loading images:', error);
  } finally {
    showLoading(false);
  }
}

// Render image tiles
function renderImageTiles(images) {
  if (images.length === 0) {
    DOM.imageContainer.innerHTML = `
      <div class="empty-state">
        <p>No images found. Enter a directory path and click "Scan Directory".</p>
      </div>`;
    return;
  }

  let html = '';

  images.forEach((item) => {
    const imageUrl = `/image/${encodeURIComponent(item.fullPath)}`;
    const fileName = item.image?.name || item.image;

    html += `
        <div class="tile is-child box image-tile" data-image="${encodeURIComponent(fileName)}" data-fullpath="${encodeURIComponent(item.fullPath || '')}">
          <article class="media">
            <div class="media-left">
              <figure class="image">
                <img src="${imageUrl}" alt="${fileName}" class="thumbnail" loading="lazy">
              </figure>
            </div>
            <div class="media-content" style="overflow: hidden;">
              <div class="content">
                <div class="level">
                  <div class="level-left">
                    <span><strong alt="${fileName}">${fileName}</strong></span>
                  </div>
                  <div class="level-right">
                    <div class="level-item">
                      <span class="save-status"></span>
                    </div>
                  </div>
                </div>
                <textarea 
                  class="textarea annotation-text" 
                  rows="3"
                  placeholder="Enter annotation for this image..."
                  data-image="${encodeURIComponent(fileName)}"
                  data-fullpath="${encodeURIComponent(item.fullPath || '')}"
                >${escapeHtml(item.annotation || '')}</textarea>
              </div>
            </div>
          </article>
        </div>`;
  });

  DOM.imageContainer.innerHTML = html;

  // Add event listeners to tiles (for clicking anywhere)
  document.querySelectorAll('.image-tile').forEach(tile => {
    tile.addEventListener('click', handleTileClick);
  });

  // Add event listeners to text areas
  document.querySelectorAll('.annotation-text').forEach(textarea => {
    textarea.addEventListener('blur', handleTextAreaBlur);
    textarea.addEventListener('input', handleTextAreaInput);
  });

  // Add event listeners to thumbnails for preview
  document.querySelectorAll('.thumbnail').forEach(img => {
    img.addEventListener('mouseenter', (e) => {
      if (DOM.previewOverlay) {
        DOM.previewOverlay.src = e.target.src;
        DOM.previewOverlay.style.display = 'block';
      }
    });

    img.addEventListener('mousemove', (e) => {
      if (DOM.previewOverlay) {
        const offset = 15;
        DOM.previewOverlay.style.left = (e.clientX + offset) + 'px';
        DOM.previewOverlay.style.top = (e.clientY + offset) + 'px';
      }
    });

    img.addEventListener('mouseleave', () => {
      if (DOM.previewOverlay) {
        DOM.previewOverlay.style.display = 'none';
      }
    });
  });
}

// Handle directory scan
async function handleScanDirectory() {
  let dirPath = DOM.directoryPathInput.value.trim();

  if (!dirPath) {
    alert('Please enter a directory path');
    return;
  }

  dirPath = cleanPath(dirPath);

  if (!dirPath) {
    alert('Please enter a valid directory path');
    return;
  }

  showLoading(true);

  try {
    const response = await fetch('/api/scandir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath: dirPath })
    });

    const data = await response.json();

    if (response.ok) {
      AppState.currentDirectory = data.directory;
      AppState.currentImages = data.images;

      switchToAnnotationMode();
      renderKeywordChips();
      renderImageTiles(AppState.currentImages);
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Error scanning directory:', error);
    alert('Failed to scan directory');
  } finally {
    showLoading(false);
  }
}

// Clean path function (remove quotes)
function cleanPath(dirPath) {
  if (!dirPath) return '';

  let cleaned = dirPath.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
}

// Show/hide loading overlay
function showLoading(show) {
  if (show) {
    DOM.loadingOverlay.style.display = 'flex';
  } else {
    DOM.loadingOverlay.style.display = 'none';
  }
}

// Render LLM models list
function renderModelsList(models) {
  const listEl = document.getElementById('llm-models-list');
  if (!models.length) {
    listEl.innerHTML = '<p class="has-text-grey">No models available.</p>';
    return;
  }
  let html = '';
  models.forEach((model) => {
    const name = model.display_name || model.id;
    const colorClass = model.loaded ? 'has-text-success' : '';
    const loadedText = model.loaded ? ' (loaded)' : '';
    html += `
      <label class="radio ${colorClass}">
        <input type="radio" name="selected-llm-model" value="${escapeHtml(name)}">
        ${escapeHtml(name)}${loadedText}
      </label><br>
    `;
  });
  listEl.innerHTML = html;
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
