// State object - holds all application state
const AppState = {
  currentImages: [],
  currentDirectory: '',
  keywordCounts: {}, // { keyword: count }
  selectedTile: null,
  selectedTextarea: null,
  llmEndpoint: 'http://localhost:1234',
  isAnnotating: false,
  isStopped: false,
  llmInstanceId: null,
  selectedLlmModel: null,
  llmAnnotationMode: 'add',
  llmAnnotationScope: 'all',
  llmPrompt: '',
  filteringKeywords: [],
  filteredImages: [],
  filterActive: false
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

  // Stop annotating button
  const stopAnnotatingBtn = document.getElementById('stop-annotating-btn');
  if (stopAnnotatingBtn) {
    stopAnnotatingBtn.addEventListener('click', async () => {
      AppState.isStopped = true;
      stopAnnotatingBtn.disabled = true;
      stopAnnotatingBtn.textContent = 'Stopping...';
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

      // Get annotation scope
      const annotationScopeRadio = document.querySelector('input[name="llm-annotation-scope"]:checked');
      const annotationScope = annotationScopeRadio ? annotationScopeRadio.value : 'all';

      try {
        const promptInput = document.getElementById('llm-prompt');
        AppState.selectedLlmModel = selectedModel;
        AppState.llmAnnotationMode = annotationMode;
        AppState.llmAnnotationScope = annotationScope;
        AppState.llmPrompt = promptInput ? promptInput.value : '';
        AppState.isAnnotating = true;
        AppState.isStopped = false;
        AppState.llmInstanceId = selectedModel;

        startAnnotationLoop();
      } catch (error) {
        startAnnotatingBtn.classList.remove('is-loading');
        startAnnotatingBtn.disabled = false;
        console.error('Error setting up annotation:', error);
        alert('Failed to set up annotation: ' + error.message);
      }
    });
  }

  // Helper to read image and convert to base64
  async function getImageBase64(imagePath) {
    try {
      const response = await fetch(`/image/${encodeURIComponent(imagePath)}`);
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error reading image:', error);
      return null;
    }
  }

  // Helper to save annotation for a specific textarea
  async function saveAnnotationDirect(textarea) {
    const imageFileEncoded = textarea.dataset.image;
    const fullPathEncoded = textarea.dataset.fullpath;
    const annotation = textarea.value;

    const imageFile = decodeURIComponent(imageFileEncoded);
    let directoryPath = AppState.currentDirectory;
    if (fullPathEncoded) {
      const fullPath = decodeURIComponent(fullPathEncoded);
      const lastSlash = fullPath.lastIndexOf('/');
      if (lastSlash > -1) {
        directoryPath = fullPath.substring(0, lastSlash);
      }
    }

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
        const imageFileKey = decodeURIComponent(imageFileEncoded);
        const imageIndex = AppState.currentImages.findIndex(img => img.image?.name === imageFileKey || img.fullPath.includes(imageFileKey));
        if (imageIndex > -1) {
          AppState.currentImages[imageIndex].annotation = annotation;
        }

        if (saveStatus) {
          saveStatus.style.color = '#48c774';
          saveStatus.textContent = 'Saved';
          setTimeout(() => {
            saveStatus.textContent = '';
          }, 2000);
        }

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

  // Main annotation loop function
  async function startAnnotationLoop() {
    const progressEl = document.getElementById('llm-annotation-progress');
    const progressLabel = document.getElementById('llm-annotation-progress-label');
    const stopBtn = document.getElementById('stop-annotating-btn');
    const startBtn = document.getElementById('start-annotating-btn');
    const imagesToProcess = AppState.filterActive ? AppState.filteredImages : AppState.currentImages;
    const totalImages = imagesToProcess.length;
    const mode = AppState.llmAnnotationMode;
    const scope = AppState.llmAnnotationScope;

    // Determine loop start and end based on scope
    let startIndex = 0;
    let endIndex = totalImages;

    if (scope === 'forward') {
      if (!AppState.selectedTile) {
        alert('Select a starting image.');
        return;
      }
      const selName = decodeURIComponent(AppState.selectedTile.dataset.image);
      startIndex = imagesToProcess.findIndex(img => img.image?.name === selName);
      if (startIndex === -1) startIndex = 0;
    } else if (scope === 'selected') {
      if (!AppState.selectedTile) {
        alert('Select an image.');
        return;
      }
      const selName = decodeURIComponent(AppState.selectedTile.dataset.image);
      startIndex = imagesToProcess.findIndex(img => img.image?.name === selName);
      if (startIndex === -1) return;

      // Check skip condition for single image
      const selectedImg = imagesToProcess[startIndex];
      if (mode === 'skip' && selectedImg.annotation && selectedImg.annotation.trim()) {
        alert('Selected image is already annotated.');
        return;
      }

      endIndex = startIndex + 1;
    }

    startAnnotatingBtn.classList.add('is-loading');
    startAnnotatingBtn.disabled = true;
    progressEl.style.display = 'block';
    progressLabel.style.display = 'block';
    stopBtn.style.display = 'inline-flex';
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop annotating';
    startBtn.style.display = 'none';
    startBtn.disabled = true;

    for (let i = startIndex; i < endIndex; i++) {
      if (AppState.isStopped) {
        break;
      }

      const item = imagesToProcess[i];

      // Skip mode check
      if (mode === 'skip' && item.annotation && item.annotation.trim()) {
        continue;
      }

      const currentNum = i + 1;
      progressEl.textContent = `Annotating ${currentNum} of ${endIndex}...`;

      // Find the tile and save status
      const tile = document.querySelector(`.image-tile[data-image="${encodeURIComponent(item.image.name || item.image)}"]`);
      if (tile) {
        const saveStatus = tile.querySelector('.save-status');
        if (saveStatus) {
          saveStatus.textContent = 'Generating annotation...';
          saveStatus.style.color = '#3273dc';
        }
      }

      // Get image base64
      const imageBase64 = await getImageBase64(item.fullPath);
      if (!imageBase64) {
        console.error('Failed to read image:', item.fullPath);
        continue;
      }

      // Call BE endpoint
      let llmResult = '';
      try {
        const response = await fetch('/api/llm/annotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: AppState.selectedLlmModel,
            endpoint: AppState.llmEndpoint,
            imagePath: item.fullPath,
            prompt: AppState.llmPrompt || null
          })
        });

        const data = await response.json();
        if (data.error) {
          console.error('LLM Annotate Error:', data.error);
          if (tile) {
            const saveStatus = tile.querySelector('.save-status');
            if (saveStatus) {
              saveStatus.textContent = 'LLM Error';
              saveStatus.style.color = '#ff3860';
            }
          }
          continue;
        }

        llmResult = data.result;

        // Store model_instance_id if returned
        if (data.model_instance_id) {
          AppState.llmInstanceId = data.model_instance_id;
        }

        // Find the textarea for this image
        const textarea = tile?.querySelector('.annotation-text');
        if (textarea) {
          let newAnnotation = '';
          if (AppState.llmAnnotationMode === 'replace') {
            newAnnotation = llmResult;
          } else {
            const existingAnnotation = textarea.value;
            const combinedKeywords = [
              ...existingAnnotation.split(','),
              ...llmResult.split(',')
            ]
              .map(k => k.trim())
              .filter(k => k);
            const uniqueKeywords = [...new Set(combinedKeywords)];
            newAnnotation = uniqueKeywords.join(', ');
          }

          textarea.value = newAnnotation;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));

          // Trigger save
          await saveAnnotationDirect(textarea);
        }
      } catch (error) {
        console.error('Error during annotation:', error);
      }
    }

    // Loop completed or stopped
    // Unload model if instance_id is available
    if (AppState.llmInstanceId) {
      try {
        await fetch('/api/llm/unload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: AppState.llmEndpoint,
            instance_id: AppState.llmInstanceId
          })
        });
      } catch (error) {
        console.error('Error unloading model:', error);
      }
      AppState.llmInstanceId = null;
    }

    // Reset state
    AppState.isAnnotating = false;
    AppState.isStopped = false;

    // Update GUI
    progressEl.style.display = 'none';
    progressLabel.style.display = 'none';
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop annotating';
    startBtn.style.display = 'inline-flex';
    startBtn.disabled = false;
    startBtn.classList.remove('is-loading');
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

// Update keyword counts based on provided image list
function updateKeywordCounts(images) {
  // Clear existing counts to ensure stale keywords are removed
  AppState.keywordCounts = {};

  const newKeywordCounts = {};

  images.forEach((item) => {
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
  const imagesToProcess = AppState.filterActive ? AppState.filteredImages : AppState.currentImages;
  const sortedKeywords = updateKeywordCounts(imagesToProcess);

  if (sortedKeywords.length === 0) {
    container.innerHTML = '<p class="has-text-grey">No keywords found in annotations</p>';
  } else {
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

  // Update filtering dropdown
  updateFilteringDropdown(sortedKeywords);

  // Render filtering tags
  renderFilteringTags();

  // Ensure newly rendered chips are immediately synchronized with the current selection
  highlightChipsForSelectedTextarea();
}

// Event listener for filtering dropdown
const filterDropdown = document.getElementById('filter-keyword-dropdown');
if (filterDropdown) {
  filterDropdown.addEventListener('change', handleFilteringDropdownChange);
}

// Apply/Remove filter button logic
const applyFilterBtn = document.getElementById('apply-filter-btn');
if (applyFilterBtn) {
  applyFilterBtn.addEventListener('click', () => {
    if (AppState.filterActive) {
      // Remove filter
      AppState.filterActive = false;
      AppState.filteredImages = [];
      applyFilterBtn.innerText = 'Apply filter';
      renderImageTiles(AppState.currentImages);
      renderKeywordChips();
    } else {
      // Apply filter
      if (AppState.filteringKeywords.length === 0) {
        alert('Select at least one keyword.');
        return;
      }

      AppState.filterActive = true;
      applyFilterBtn.innerText = 'Remove filter';
      AppState.filteredImages = [];

      AppState.currentImages.forEach(image => {
        const imageKeywords = extractKeywords(image.annotation);
        const hasMatch = AppState.filteringKeywords.some(keyword => imageKeywords.includes(keyword));
        if (hasMatch) {
          AppState.filteredImages.push(image);
        }
      });

      renderImageTiles(AppState.filteredImages);
      renderKeywordChips();
      AppState.selectedTile = null;
    }
  });
}

// Update filtering dropdown with all available keywords
function updateFilteringDropdown(keywords) {
  const dropdown = document.getElementById('filter-keyword-dropdown');
  if (!dropdown) return;

  // Keep the first option (placeholder)
  const placeholder = dropdown.options[0];
  dropdown.innerHTML = '';
  dropdown.appendChild(placeholder);

  // Add all keywords from the current counts
  const allKeywords = Object.keys(AppState.keywordCounts).sort();
  allKeywords.forEach(keyword => {
    const option = document.createElement('option');
    option.value = keyword;
    option.textContent = keyword;
    dropdown.appendChild(option);
  });
}

// Render filtering tags
function renderFilteringTags() {
  const container = document.getElementById('filtering-tags-container');
  if (!container) return;

  container.innerHTML = '';

  if (AppState.filteringKeywords.length === 0) {
    container.innerHTML = '<p class="has-text-grey">No filtering keywords selected</p>';
    return;
  }

  AppState.filteringKeywords.forEach(keyword => {
    const controlDiv = document.createElement('div');
    controlDiv.className = 'control';

    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'tags has-addons';

    const tag = document.createElement('a');
    tag.className = 'tag is-link';
    tag.textContent = keyword;

    const deleteBtn = document.createElement('a');
    deleteBtn.className = 'tag is-delete';
    deleteBtn.addEventListener('click', () => {
      removeFilteringKeyword(keyword);
    });

    tagsDiv.appendChild(tag);
    tagsDiv.appendChild(deleteBtn);
    controlDiv.appendChild(tagsDiv);
    container.appendChild(controlDiv);
  });
}

// Add keyword to filtering list
function addFilteringKeyword(keyword) {
  if (!AppState.filteringKeywords.includes(keyword)) {
    AppState.filteringKeywords.push(keyword);
    renderFilteringTags();
  }
}

// Remove keyword from filtering list
function removeFilteringKeyword(keyword) {
  const index = AppState.filteringKeywords.indexOf(keyword);
  if (index > -1) {
    AppState.filteringKeywords.splice(index, 1);
    renderFilteringTags();
  }
}

// Handle dropdown change
function handleFilteringDropdownChange(e) {
  const keyword = e.target.value;
  if (keyword) {
    addFilteringKeyword(keyword);
    e.target.value = ''; // Reset dropdown
  }
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
        <div class="is-child box image-tile" data-image="${encodeURIComponent(fileName)}" data-fullpath="${encodeURIComponent(item.fullPath || '')}">
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
