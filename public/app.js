// State object - holds all application state
const AppState = {
  currentImages: [],
  currentDirectory: '',
  keywordCounts: {}, // { keyword: count }
  selectedTile: null,
  selectedTextarea: null
};

// DOM elements cache
const DOM = {
  directoryPathInput: document.getElementById('directory-path'),
  scanBtn: document.getElementById('scan-btn'),
  clearBtn: document.getElementById('clear-btn'),
  imageContainer: document.getElementById('image-container'),
  loadingOverlay: document.getElementById('loading-overlay'),
  initialModeDiv: document.getElementById('initial-mode'),
  annotationModeDiv: document.getElementById('annotation-mode'),
  keywordChipsContainer: document.getElementById('keyword-chips-container')
};

// Load existing images on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadImages();

  // Event listeners
  DOM.scanBtn.addEventListener('click', handleScanDirectory);
  DOM.clearBtn.addEventListener('click', clearImages);
});

// Switch to initial mode
function switchToInitialMode() {
  DOM.initialModeDiv.style.display = 'block';
  DOM.annotationModeDiv.style.display = 'none';
}

// Switch to annotation mode
function switchToAnnotationMode() {
  DOM.initialModeDiv.style.display = 'none';
  DOM.annotationModeDiv.style.display = 'block';
}

// Select tile (keep at least one selected if possible)
function selectTile(tile) {
  // Deselect previous tile only if we're selecting a different one
  if (AppState.selectedTile && AppState.selectedTile !== tile) {
    AppState.selectedTile.classList.remove('is-primary');
    AppState.selectedTile.classList.remove('has-background-success-light');
    AppState.selectedTextarea?.classList.remove('is-success');
  }

  // Select new tile
  AppState.selectedTile = tile;
  AppState.selectedTextarea = tile.querySelector('.annotation-text');

  // Highlight tile
  tile.classList.add('is-primary');
  tile.classList.add('has-background-success-light');
  AppState.selectedTextarea?.classList.add('is-success');

  // Update chip highlights based on new selection
  highlightChipsForSelectedTextarea();
}

// Clear images
function clearImages() {
  AppState.selectedTile = null;
  AppState.selectedTextarea = null;

  AppState.currentDirectory = '';
  DOM.directoryPathInput.value = '';
  AppState.currentImages = [];

  switchToInitialMode();
  DOM.imageContainer.innerHTML = '';
  DOM.clearBtn.disabled = true;
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

  // If no tile/textarea selected, do nothing
  if (!AppState.selectedTextarea) {
    return;
  }

  // Get current annotation from selected textarea
  let annotation = AppState.selectedTextarea.value;

  if (chip.classList.contains('highlighted')) {
    // Remove keyword
    const keywords = extractKeywords(annotation);
    const index = keywords.indexOf(keyword);

    if (index > -1) {
      keywords.splice(index, 1);
    }

    AppState.selectedTextarea.value = keywords.join(', ');
  } else {
    // Add keyword
    if (annotation.trim()) {
      if (!annotation.endsWith(', ')) {
        annotation += ', ';
      }
    } else {
      annotation = '';
    }

    annotation += keyword;
    AppState.selectedTextarea.value = annotation;
  }

  // Trigger input to update highlights
  const event = new Event('input', { bubbles: true });
  AppState.selectedTextarea.dispatchEvent(event);

  // Also trigger save
  saveAnnotation(AppState.selectedTextarea);

  //Also highlight chips
  highlightChipsForSelectedTextarea()
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
  const tile = e.currentTarget;

  // Don't re-select if already selected
  if (AppState.selectedTile === tile) {
    return;
  }

  selectTile(tile);
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
        DOM.clearBtn.disabled = false;
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
              <figure class="image is-128x128">
                <img src="${imageUrl}" alt="${fileName}" class="thumbnail" loading="lazy">
              </figure>
            </div>
            <div class="media-content">
              <div class="content">
                <div class="level">
                  <div class="level-left">
                    <span><strong>${fileName}</strong></span>
                  </div>
                  <div class="level-right">
                    <div class="level-item">
                      <span class="save-status"></span>
                    </div>
                  </div>
                </div>
                <textarea 
                  class="textarea annotation-text" 
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
      DOM.clearBtn.disabled = false;
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
