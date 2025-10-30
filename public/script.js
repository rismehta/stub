const form = document.getElementById('mockApiForm');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const messageDiv = document.getElementById('message');
const mocksList = document.getElementById('mocksList');
const formTitle = document.getElementById('formTitle');

let currentEditId = null;

// Response type toggle
const responseTypeSelect = document.getElementById('responseType');
const staticResponseSection = document.getElementById('staticResponseSection');
const dynamicResponseSection = document.getElementById('dynamicResponseSection');

responseTypeSelect.addEventListener('change', () => {
  if (responseTypeSelect.value === 'dynamic') {
    staticResponseSection.style.display = 'none';
    dynamicResponseSection.style.display = 'block';
  } else {
    staticResponseSection.style.display = 'block';
    dynamicResponseSection.style.display = 'none';
  }
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tab}Tab`).classList.add('active');
    
    // Load mocks when switching to manage tab
    if (tab === 'manage') {
      loadMocks();
    }
    
    // Reset form when switching to create tab
    if (tab === 'create' && currentEditId !== null) {
      resetForm();
      formTitle.textContent = 'Create New Mock';
      cancelBtn.style.display = 'none';
      currentEditId = null;
    }
  });
});

// Cancel edit button
cancelBtn.addEventListener('click', () => {
  resetForm();
  formTitle.textContent = 'Create New Mock';
  cancelBtn.style.display = 'none';
  currentEditId = null;
});

function parseJSONSafe(text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function showError(msg) {
  messageDiv.textContent = msg;
  messageDiv.className = 'message error';
}

function showSuccess(msg) {
  messageDiv.textContent = msg;
  messageDiv.className = 'message success';
}

function resetForm() {
  form.reset();
  document.getElementById('mockId').value = '';
  messageDiv.textContent = '';
  messageDiv.className = 'message';
  
  // Reset response type to static and show correct section
  document.getElementById('responseType').value = 'static';
  staticResponseSection.style.display = 'block';
  dynamicResponseSection.style.display = 'none';
}

// JSON Import functionality
const jsonFileInput = document.getElementById('jsonFileInput');
const importJsonBtn = document.getElementById('importJsonBtn');
const jsonFileName = document.getElementById('jsonFileName');
const jsonImportMessage = document.getElementById('jsonImportMessage');

// Import JSON button styling and click handler
importJsonBtn.addEventListener('click', () => {
  jsonFileInput.click();
});

// Add hover effect for import button
importJsonBtn.addEventListener('mouseenter', () => {
  importJsonBtn.style.background = 'linear-gradient(90deg, #a35203, #c4852f 70%)';
  importJsonBtn.style.boxShadow = '6px 6px 18px rgba(176, 112, 33, 0.5)';
});

importJsonBtn.addEventListener('mouseleave', () => {
  importJsonBtn.style.background = 'linear-gradient(90deg, #bc6c25, #a35203)';
  importJsonBtn.style.boxShadow = '4px 4px 12px rgba(140, 90, 20, 0.4)';
});

jsonFileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;
  
  const fileCount = files.length;
  jsonFileName.textContent = `Selected: ${fileCount} file${fileCount > 1 ? 's' : ''}`;
  jsonImportMessage.textContent = 'Uploading...';
  jsonImportMessage.className = 'message';
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const file of files) {
    try {
      const text = await file.text();
      const mockData = JSON.parse(text);
      
      // Validate required fields
      if (!mockData.apiName) {
        results.failed.push({ file: file.name, error: 'Missing "apiName" field' });
        continue;
      }
      
      if (!mockData.responseBody) {
        results.failed.push({ file: file.name, error: 'Missing "responseBody" field' });
        continue;
      }
      
      // Upload as temporary mock
      const response = await fetch('/api/mocks/upload-temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockData)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        results.success.push({
          file: file.name,
          apiName: result.mock.apiName,
          method: result.mock.method,
          testUrl: result.testUrl
        });
      } else {
        results.failed.push({ file: file.name, error: result.error || 'Upload failed' });
      }
    } catch (err) {
      results.failed.push({ file: file.name, error: err.message });
    }
  }
  
  // Display results
  if (results.success.length > 0 && results.failed.length === 0) {
    // All succeeded
    let successHtml = `
      <div style="color: #6d5c00; background: #fff9e6; padding: 1rem; border-radius: 10px; border: 2px solid #d4af37;">
        <strong style="color: #854505;">✓ ${results.success.length} temporary mock${results.success.length > 1 ? 's' : ''} uploaded!</strong><br>
        <div style="font-size: 0.9rem; margin-top: 0.5rem;">
    `;
    
    results.success.forEach(s => {
      successHtml += `
        <div style="margin: 0.3rem 0; padding: 0.4rem 0.6rem; background: #fffbf3; border-left: 3px solid #bc6c25; border-radius: 4px;">
          <strong style="color: #854505;">${s.apiName}</strong> <span style="color: #a67c52;">(${s.method})</span> - <span style="color: #6d4c41;">${s.file}</span>
        </div>
      `;
    });
    
    successHtml += `
        </div>
        <em style="color: #a67c52; font-size: 0.85rem;">These mocks are in-memory only and will vanish when pushed to GitHub.</em><br>
        <button type="button" onclick="loadMocks(); document.querySelector('[data-tab=manage]').click();" 
                style="margin-top: 0.75rem; padding: 0.5rem 1rem; background: linear-gradient(90deg, #bc6c25, #a35203); color: #fff6e7; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; box-shadow: 3px 3px 10px rgba(140, 90, 20, 0.3);">
          View in Manage Tab
        </button>
      </div>
    `;
    
    jsonImportMessage.innerHTML = successHtml;
    jsonImportMessage.className = 'message success';
  } else if (results.success.length > 0 && results.failed.length > 0) {
    // Partial success
    let mixedHtml = `
      <div style="background: #fff4e6; padding: 1rem; border-radius: 10px; border: 2px solid #d4a574;">
        <strong style="color: #a65b1b;">⚠ ${results.success.length} succeeded, ${results.failed.length} failed</strong><br>
        <div style="font-size: 0.9rem; margin-top: 0.5rem;">
    `;
    
    // Show successes
    if (results.success.length > 0) {
      mixedHtml += '<div style="margin-bottom: 0.5rem; color: #6d5c00;"><strong>Success:</strong></div>';
      results.success.forEach(s => {
        mixedHtml += `
          <div style="margin: 0.2rem 0; padding: 0.3rem 0.5rem; background: #fffbf3; border-left: 3px solid #bc6c25; border-radius: 3px; font-size: 0.85rem;">
            <span style="color: #854505;">${s.apiName}</span> <span style="color: #a67c52;">(${s.method})</span> - <span style="color: #6d4c41;">${s.file}</span>
          </div>
        `;
      });
    }
    
    // Show failures
    if (results.failed.length > 0) {
      mixedHtml += '<div style="margin-top: 0.5rem; margin-bottom: 0.5rem; color: #8b4513;"><strong>✗ Failed:</strong></div>';
      results.failed.forEach(f => {
        mixedHtml += `
          <div style="margin: 0.2rem 0; padding: 0.3rem 0.5rem; background: #ffeee6; border-left: 3px solid #c65d3b; border-radius: 3px; font-size: 0.85rem;">
            <span style="color: #8b4513;">${f.file}:</span> <span style="color: #6d4c41;">${f.error}</span>
          </div>
        `;
      });
    }
    
    mixedHtml += `
        </div>
        <button type="button" onclick="loadMocks(); document.querySelector('[data-tab=manage]').click();" 
                style="margin-top: 0.75rem; padding: 0.5rem 1rem; background: linear-gradient(90deg, #bc6c25, #a35203); color: #fff6e7; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; box-shadow: 3px 3px 10px rgba(140, 90, 20, 0.3);">
          View Successful Mocks
        </button>
      </div>
    `;
    
    jsonImportMessage.innerHTML = mixedHtml;
    jsonImportMessage.className = 'message';
    jsonImportMessage.style.background = 'transparent';
  } else {
    // All failed
    let errorHtml = `
      <div style="background: #ffeee6; padding: 1rem; border-radius: 10px; border: 2px solid #c65d3b;">
        <strong style="color: #8b4513;">✗ All ${results.failed.length} file${results.failed.length > 1 ? 's' : ''} failed to upload</strong><br>
        <div style="font-size: 0.9rem; margin-top: 0.5rem;">
    `;
    
    results.failed.forEach(f => {
      errorHtml += `
        <div style="margin: 0.3rem 0; padding: 0.4rem 0.6rem; background: #fff6f3; border-left: 3px solid #c65d3b; border-radius: 4px;">
          <strong style="color: #8b4513;">${f.file}:</strong> <span style="color: #6d4c41;">${f.error}</span>
        </div>
      `;
    });
    
    errorHtml += '</div></div>';
    
    jsonImportMessage.innerHTML = errorHtml;
    jsonImportMessage.className = 'message error';
  }
  
  // Reset file input
  jsonFileInput.value = '';
  setTimeout(() => {
    jsonFileName.textContent = '';
  }, 3000);
});

// Save/Update mock
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageDiv.textContent = '';
  messageDiv.className = 'message';

  const businessName = document.getElementById('businessName').value.trim();
  const apiName = document.getElementById('apiName').value.trim();
  const method = document.getElementById('method').value || 'POST';
  const latencyMs = parseInt(document.getElementById('latencyMs').value) || 0;
  const predicateRequestText = document.getElementById('predicateRequest').value.trim();
  const predicateHeadersText = document.getElementById('predicateHeaders').value.trim();
  const predicateQueryText = document.getElementById('predicateQuery').value.trim();
  const requestPayloadText = document.getElementById('requestPayload').value.trim();
  const responseHeadersText = document.getElementById('responseHeaders').value.trim();
  const responseType = document.getElementById('responseType').value;
  const responseBodyText = document.getElementById('responseBody').value.trim();
  const responseFunctionText = document.getElementById('responseFunction').value.trim();

  if (!apiName) {
    return showError('API Name is required');
  }

  const predicateRequest = parseJSONSafe(predicateRequestText);
  if (predicateRequest === null) return showError('Invalid Request Body Criteria JSON');

  const predicateHeaders = parseJSONSafe(predicateHeadersText);
  if (predicateHeaders === null) return showError('Invalid Request Headers Criteria JSON');

  const predicateQuery = parseJSONSafe(predicateQueryText);
  if (predicateQuery === null) return showError('Invalid Query Parameters Criteria JSON');

  const requestPayload = parseJSONSafe(requestPayloadText);
  if (requestPayload === null) return showError('Invalid Request Payload JSON');

  const responseHeaders = parseJSONSafe(responseHeadersText);
  if (responseHeaders === null) return showError('Invalid Response Headers JSON');

  // Validate based on response type
  let responseBody = {};
  let responseFunction = '';
  
  if (responseType === 'dynamic') {
    if (!responseFunctionText) {
      return showError('Response Function is required for dynamic responses');
    }
    responseFunction = responseFunctionText;
    responseBody = {}; // Empty for dynamic
  } else {
    // If response body is empty, default to {}
    const responseBodyValue = responseBodyText.trim() || '{}';
    responseBody = parseJSONSafe(responseBodyValue);
  if (responseBody === null) return showError('Invalid Response Body JSON');
  }

  // Empty response body {} is valid for some APIs (e.g., 204 No Content, empty 200 OK)

  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = currentEditId ? 'Updating...' : 'Saving...';

  const payload = {
    businessName,
    apiName,
    method,
    latencyMs,
    predicate: {
      request: predicateRequest,
      headers: predicateHeaders,
      query: predicateQuery
    },
    requestPayload,
    responseType,
    responseFunction,
    responseHeaders,
    responseBody,
  };

  // Add mockId if editing
  if (currentEditId) {
    payload._id = currentEditId;
  }

  try {
    const resp = await fetch('/api/saveOrUpdate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (resp.ok) {
      const action = currentEditId ? 'updated' : 'created';
      showSuccess(`✅ Success! Mock ${action} for API: ${apiName}`);
      resetForm();
      formTitle.textContent = 'Create New Mock';
      cancelBtn.style.display = 'none';
      currentEditId = null;
      
      // Reload mocks list if on manage tab
      if (document.getElementById('manageTab').classList.contains('active')) {
        setTimeout(() => loadMocks(), 500);
      }
      
      // Auto-dismiss success message after 3 seconds
      setTimeout(() => {
        messageDiv.textContent = '';
        messageDiv.className = 'message';
      }, 3000);
    } else {
      showError('❌ ' + (data.error || 'Server error'));
    }
  } catch (e) {
    showError('❌ Network or server error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
});

// Store mocks globally for test functionality
let allMocks = [];

// Load all mocks
async function loadMocks() {
  mocksList.innerHTML = '<p class="loading">Loading mocks...</p>';
  
  try {
    const resp = await fetch('/api/mocks');
    if (!resp.ok) {
      mocksList.innerHTML = '<p class="error">Failed to load mocks</p>';
      return;
    }
    
    const mocks = await resp.json();
    
    console.log(`Loaded ${mocks.length} total mocks`);
    
    // Store globally for testing
    allMocks = mocks;
    
    if (mocks.length === 0) {
      mocksList.innerHTML = '<p class="empty">No mocks created yet. Create your first mock!</p>';
      return;
    }
    
    // Count by source
    const tempCount = mocks.filter(m => m._source === 'temporary' || m._isTemporary).length;
    const githubCount = mocks.filter(m => m._source === 'external').length;
    
    console.log(`Temp: ${tempCount}, GitHub: ${githubCount}`);
    
    // Group by API name - filter out mocks with missing apiName
    const grouped = {};
    let skippedCount = 0;
    
    mocks.forEach(mock => {
      if (!mock.apiName || mock.apiName.trim() === '') {
        console.warn('Skipping mock with missing apiName:', mock);
        skippedCount++;
        return;
      }
      
      if (!grouped[mock.apiName]) {
        grouped[mock.apiName] = [];
      }
      grouped[mock.apiName].push(mock);
    });
    
    if (skippedCount > 0) {
      console.warn(`Skipped ${skippedCount} mock(s) with missing apiName`);
    }
    
    // Add summary banner
    let html = '';
    
    if (tempCount > 0 || githubCount > 0) {
      html += '<div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; display: flex; gap: 1rem; flex-wrap: wrap;">';
      
      if (tempCount > 0) {
        html += `<div style="background: #e3f2ff; padding: 0.5rem 1rem; border-radius: 6px; border-left: 4px solid #4a90e2;">
          <strong style="color: #4a90e2;">Temporary:</strong> ${tempCount} mock${tempCount > 1 ? 's' : ''}
        </div>`;
      }
      
      if (githubCount > 0) {
        html += `<div style="background: #f3e5f5; padding: 0.5rem 1rem; border-radius: 6px; border-left: 4px solid #6e5494;">
          <strong style="color: #6e5494;">GitHub:</strong> ${githubCount} mock${githubCount > 1 ? 's' : ''}
        </div>`;
      }
      
      html += '</div>';
    }
    
    html += '<div class="mocks-grid">';
    
    const sortedApiNames = Object.keys(grouped).sort();
    console.log(`Rendering ${sortedApiNames.length} API groups`);
    
    sortedApiNames.forEach((apiName, groupIndex) => {
      try {
        const apiMocks = grouped[apiName];
      // Ensure path starts with single slash
      const displayPath = apiName.startsWith('/') ? apiName : `/${apiName}`;
      
      html += `
        <div class="mock-card">
          <div class="mock-header">
            <h3>${displayPath}</h3>
            <span class="mock-count">${apiMocks.length} variant${apiMocks.length > 1 ? 's' : ''}</span>
          </div>
          <div class="mock-variants">
      `;
      
      apiMocks.forEach(mock => {
        const hasBodyPred = mock.predicate?.request && Object.keys(mock.predicate.request).length > 0;
        const hasHeaderPred = mock.predicate?.headers && Object.keys(mock.predicate.headers).length > 0;
        const hasQueryPred = mock.predicate?.query && Object.keys(mock.predicate.query).length > 0;
        const predicateInfo = [];
        if (hasBodyPred) predicateInfo.push('Body Match');
        if (hasHeaderPred) predicateInfo.push('Header Match');
        if (hasQueryPred) predicateInfo.push('Query Match');
        const predicateStr = predicateInfo.length > 0 ? predicateInfo.join(' + ') : 'Any Request';
        
        const method = mock.method || 'POST';
        const businessName = mock.businessName ? `<span class="variant-business-name">${mock.businessName}</span>` : '';
        
        // Latency badge
        const latency = mock.latencyMs !== undefined ? mock.latencyMs : 0;
        const latencyClass = latency === 0 ? 'instant' : latency < 200 ? 'fast' : latency > 1000 ? 'slow' : '';
        const latencyBadge = `<span class="latency-badge ${latencyClass}">${latency}ms</span>`;
        
        // Source badges
        const isExternalMock = mock._source === 'external';
        const isTemporaryMock = mock._source === 'temporary' || mock._isTemporary;
        
        let sourceBadge = '';
        if (isTemporaryMock) {
          sourceBadge = '<span class="source-badge temp">⚡ TEMPORARY</span>';
        } else if (isExternalMock) {
          sourceBadge = '<span class="source-badge github">📦 GitHub</span>';
        }
        
        // Store mock index for testing (avoids ID issues with external mocks)
        const mockIndex = mocks.findIndex(m => m.apiName === mock.apiName && JSON.stringify(m.predicate) === JSON.stringify(mock.predicate));
        
        // Action buttons based on source
        let actionButtons;
        if (isTemporaryMock) {
          // Temporary mocks: Test + Delete
          const encodedApiName = encodeURIComponent(mock.apiName);
          actionButtons = `
            <button class="btn-test" onclick="testMockByIndex(${mockIndex}, '${apiName}', '${method}')">Test</button>
            <button class="btn-delete" onclick="deleteTempMock('${encodedApiName}', '${method}', '${apiName}')">Delete</button>
          `;
        } else if (isExternalMock) {
          // External (GitHub) mocks: Test only
          actionButtons = `<button class="btn-test" onclick="testMockByIndex(${mockIndex}, '${apiName}', '${method}')">Test</button>`;
        } else {
          // MongoDB mocks: Full actions
          actionButtons = `
            <button class="btn-test" onclick="testMockByIndex(${mockIndex}, '${apiName}', '${method}')">Test</button>
            <button class="btn-edit" onclick="editMock('${mock._id}')">Edit</button>
            <button class="btn-clone" onclick="cloneMock('${mock._id}')">Clone</button>
            <button class="btn-delete" onclick="deleteMock('${mock._id}', '${apiName}')">Delete</button>
          `;
        }
        
        html += `
          <div class="variant-item ${isTemporaryMock ? 'temp-mock' : ''}">
            <div class="variant-info">
              ${businessName}
              <span class="variant-method">${method}</span>
              ${latencyBadge}
              ${sourceBadge}
              <span class="variant-predicate">${predicateStr}</span>
            </div>
            <div class="variant-actions">
              ${actionButtons}
            </div>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
      } catch (err) {
        console.error(`Error rendering API group "${apiName}":`, err);
        html += `
          <div class="mock-card" style="border-left: 4px solid #dc3545;">
            <div class="mock-header">
              <h3>${apiName}</h3>
              <span style="color: #dc3545; font-size: 0.9rem;">⚠️ Rendering Error</span>
            </div>
            <div style="padding: 1rem; color: #721c24; background: #f8d7da; border-radius: 4px;">
              <strong>Error:</strong> ${err.message}
            </div>
          </div>
        `;
      }
    });
    
    console.log('Finished rendering all groups');
    html += '</div>';
    mocksList.innerHTML = html;
    
  } catch (err) {
    mocksList.innerHTML = '<p class="error">Error loading mocks: ' + err.message + '</p>';
  }
}

// Export MongoDB mocks to ZIP (individual JSON files) - excludes external mocks
document.getElementById('exportMongoDBMocks').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/mocks');
    const allMocksData = await response.json();
    
    // Filter to only MongoDB mocks (exclude external/GitHub mocks and temporary mocks)
    const mocks = allMocksData.filter(mock => 
      mock._source !== 'external' && 
      mock._source !== 'temporary' && 
      !mock._isTemporary
    );
    
    if (mocks.length === 0) {
      showError('No MongoDB mocks to export (only external/temporary mocks found)');
      return;
    }
    
    // Create ZIP file
    const zip = new JSZip();
    
    // Helper function to generate semantic filename from API name
    const generateFilename = (mock, index) => {
      let filename = '';
      
      // Try to use apiName first
      if (mock.apiName) {
        filename = mock.apiName
          .replace(/^API\//, '')  // Remove "API/" prefix
          .replace(/\//g, '-')     // Replace / with -
          .replace(/_/g, '-')      // Replace _ with -
          .replace(/([a-z])([A-Z])/g, '$1-$2')  // Convert camelCase to kebab-case
          .toLowerCase();
      } 
      // Fallback to businessName
      else if (mock.businessName) {
        filename = mock.businessName
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .toLowerCase();
      }
      // Last resort: use index
      else {
        filename = `mock-${index + 1}`;
      }
      
      // Remove leading/trailing hyphens
      filename = filename.replace(/^-+|-+$/g, '');
      
      // Add unique suffix if businessName exists (to support multiple variants)
      if (mock.businessName && mock.businessName.trim()) {
        const suffix = mock.businessName
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .toLowerCase()
          .substring(0, 20);
        filename = `${filename}-${suffix}`;
      }
      
      // Add method prefix for clarity
      const methodPrefix = (mock.method || 'POST').toLowerCase();
      filename = `${methodPrefix}-${filename}`;
      
      return `${filename}.json`;
    };
    
    // Group mocks by API path for folder organization
    const grouped = {};
    mocks.forEach(mock => {
      const apiPath = mock.apiName || 'uncategorized';
      if (!grouped[apiPath]) {
        grouped[apiPath] = [];
      }
      grouped[apiPath].push(mock);
    });
    
    // Add mocks to ZIP with folder structure
    let fileIndex = 0;
    Object.keys(grouped).sort().forEach(apiPath => {
      const apiMocks = grouped[apiPath];
      
      // Create folder name from API path
      const folderName = apiPath
        .replace(/^API\//, '')
        .replace(/\//g, '-')
        .replace(/_/g, '-')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
      
      apiMocks.forEach((mock, idx) => {
        // Clean mock object for export (remove MongoDB fields)
        const cleanMock = {
          businessName: mock.businessName || '',
          apiName: mock.apiName,
          method: mock.method || 'POST',
          latencyMs: mock.latencyMs !== undefined ? mock.latencyMs : 0,
          predicate: mock.predicate || {
            request: {},
            headers: {},
            query: {}
          },
          responseHeaders: mock.responseHeaders || {},
          responseBody: mock.responseBody || {}
        };
        
        // Add responseFunction if present (auto-detects dynamic vs static)
        if (mock.responseFunction && mock.responseFunction.trim() !== '') {
          cleanMock.responseFunction = mock.responseFunction;
        }
        
        // Generate filename
        const filename = generateFilename(mock, fileIndex++);
        
        // Add to ZIP in folder
        const filePath = apiMocks.length > 1 ? `${folderName}/${filename}` : `${filename}`;
        zip.file(filePath, JSON.stringify(cleanMock, null, 2));
      });
    });
    
    // Generate ZIP and download
    const timestamp = new Date().toISOString().split('T')[0];
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mongodb-mocks-${timestamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    
    showSuccess(`Exported ${mocks.length} MongoDB mock(s) to ZIP file`);
  } catch (err) {
    showError('Error exporting MongoDB mocks: ' + err.message);
  }
});

// Edit mock
window.editMock = async function(id) {
  try {
    const resp = await fetch(`/api/mocks/${id}`);
    if (!resp.ok) {
      alert('Failed to load mock');
      return;
    }
    
    const mock = await resp.json();
    
    // Fill form
    document.getElementById('mockId').value = mock._id;
    document.getElementById('businessName').value = mock.businessName || '';
    document.getElementById('apiName').value = mock.apiName;
    document.getElementById('method').value = mock.method || 'POST';
    document.getElementById('latencyMs').value = mock.latencyMs !== undefined ? mock.latencyMs : 0;
    document.getElementById('predicateRequest').value = JSON.stringify(mock.predicate?.request || {}, null, 2);
    document.getElementById('predicateHeaders').value = JSON.stringify(mock.predicate?.headers || {}, null, 2);
    document.getElementById('predicateQuery').value = JSON.stringify(mock.predicate?.query || {}, null, 2);
    document.getElementById('requestPayload').value = JSON.stringify(mock.requestPayload || {}, null, 2);
    document.getElementById('responseType').value = mock.responseType || 'static';
    document.getElementById('responseFunction').value = mock.responseFunction || '';
    document.getElementById('responseHeaders').value = JSON.stringify(mock.responseHeaders || {}, null, 2);
    document.getElementById('responseBody').value = JSON.stringify(mock.responseBody || {}, null, 2);
    
    // Trigger response type toggle
    if (mock.responseType === 'dynamic') {
      staticResponseSection.style.display = 'none';
      dynamicResponseSection.style.display = 'block';
    } else {
      staticResponseSection.style.display = 'block';
      dynamicResponseSection.style.display = 'none';
    }
    
    // Switch to create tab
    document.querySelector('.tab-btn[data-tab="create"]').click();
    
    // Update UI
    formTitle.textContent = 'Edit Mock';
    cancelBtn.style.display = 'inline-block';
    currentEditId = id;
    
    // Scroll to top
    window.scrollTo(0, 0);
    
  } catch (err) {
    alert('Error loading mock: ' + err.message);
  }
};

// Clone mock (create new from existing)
window.cloneMock = async function(id) {
  try {
    const resp = await fetch(`/api/mocks/${id}`);
    if (!resp.ok) {
      alert('Failed to load mock');
      return;
    }
    
    const mock = await resp.json();
    
    // Fill form WITHOUT setting mockId (so it creates new)
    document.getElementById('mockId').value = '';
    document.getElementById('businessName').value = mock.businessName || '';
    document.getElementById('apiName').value = mock.apiName;
    document.getElementById('method').value = mock.method || 'POST';
    document.getElementById('latencyMs').value = mock.latencyMs !== undefined ? mock.latencyMs : 0;
    document.getElementById('predicateRequest').value = JSON.stringify(mock.predicate?.request || {}, null, 2);
    document.getElementById('predicateHeaders').value = JSON.stringify(mock.predicate?.headers || {}, null, 2);
    document.getElementById('predicateQuery').value = JSON.stringify(mock.predicate?.query || {}, null, 2);
    document.getElementById('requestPayload').value = JSON.stringify(mock.requestPayload || {}, null, 2);
    document.getElementById('responseType').value = mock.responseType || 'static';
    document.getElementById('responseFunction').value = mock.responseFunction || '';
    document.getElementById('responseHeaders').value = JSON.stringify(mock.responseHeaders || {}, null, 2);
    document.getElementById('responseBody').value = JSON.stringify(mock.responseBody || {}, null, 2);
    
    // Trigger response type toggle
    if (mock.responseType === 'dynamic') {
      staticResponseSection.style.display = 'none';
      dynamicResponseSection.style.display = 'block';
    } else {
      staticResponseSection.style.display = 'block';
      dynamicResponseSection.style.display = 'none';
    }
    
    // Switch to create tab
    document.querySelector('.tab-btn[data-tab="create"]').click();
    
    // Update UI
    formTitle.textContent = 'Clone Mock (Create New)';
    cancelBtn.style.display = 'inline-block';
    currentEditId = null; // Important: null so it creates new
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    // Show message to user
    showSuccess('Mock loaded! Modify predicates or response and save to create a new stub.');
    
  } catch (err) {
    alert('Error loading mock: ' + err.message);
  }
};

// Delete mock
window.deleteMock = async function(id, apiName) {
  if (!confirm(`🗑️  Delete this mock for "${apiName}"?\n\nThis action cannot be undone.`)) {
    return;
  }
  
  // Show loading state
  const mocksList = document.getElementById('mocksList');
  const originalContent = mocksList.innerHTML;
  mocksList.innerHTML = '<p class="loading">Deleting mock...</p>';
  
  try {
    const resp = await fetch(`/api/mocks/${id}`, { method: 'DELETE' });
    if (resp.ok) {
      // Show success message briefly then reload
      mocksList.innerHTML = '<p class="success" style="color: #556b2f; padding: 2rem; text-align: center; font-size: 1.1rem;">✅ Mock deleted successfully!</p>';
      setTimeout(() => loadMocks(), 800);
    } else {
      const data = await resp.json();
      mocksList.innerHTML = originalContent;
      alert('❌ Failed to delete: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    mocksList.innerHTML = originalContent;
    alert('❌ Error deleting mock: ' + err.message);
  }
};

// Delete temporary mock
window.deleteTempMock = async function(encodedApiName, method, displayName) {
  if (!confirm(`🗑️  Delete temporary mock for "${displayName}"?\n\nThis is an in-memory mock (not in GitHub).`)) {
    return;
  }
  
  // Show loading state
  const mocksList = document.getElementById('mocksList');
  const originalContent = mocksList.innerHTML;
  mocksList.innerHTML = '<p class="loading">Deleting temporary mock...</p>';
  
  try {
    const resp = await fetch(`/api/mocks/temp/${encodedApiName}?method=${method}`, { method: 'DELETE' });
    if (resp.ok) {
      // Show success message briefly then reload
      mocksList.innerHTML = '<p class="success" style="color: #556b2f; padding: 2rem; text-align: center; font-size: 1.1rem;">✅ Temporary mock deleted!</p>';
      setTimeout(() => loadMocks(), 800);
    } else {
      const data = await resp.json();
      mocksList.innerHTML = originalContent;
      alert('❌ Failed to delete: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    mocksList.innerHTML = originalContent;
    alert('❌ Error deleting temporary mock: ' + err.message);
  }
};

// ============================================================================
// IMPORT FUNCTIONALITY
// ============================================================================

const importFile = document.getElementById('importFile');
const fileDropZone = document.getElementById('fileDropZone');
const importPreview = document.getElementById('importPreview');
const importPreviewContent = document.getElementById('importPreviewContent');
const importMessage = document.getElementById('importMessage');
const cancelImport = document.getElementById('cancelImport');
const importSelected = document.getElementById('importSelected');

let parsedImportData = [];
let selectedImports = [];

// Column name patterns for flexible matching
const COLUMN_PATTERNS = {
  businessName: ['name', 'business name', 'api name', 'description', 'label', 'title', 'action'],
  path: ['path', 'api path', 'endpoint', 'url', 'route', 'api', 'uri'],
  method: ['method', 'http method', 'verb', 'http verb'],
  latencyMs: ['latency', 'latency (ms)', 'latency ms', 'delay', 'wait', 'response time'],
  request: ['request', 'request body', 'request payload', 'req body', 'request json', 'input', 'req'],
  response: ['response', 'response body', 'response payload', 'res body', 'response json', 'output', 'res'],
  headers: ['headers', 'request headers', 'header', 'http headers'],
  query: ['query', 'query params', 'query parameters', 'query string', 'url params'],
  responseHeaders: ['response headers', 'response header', 'res headers', 'output headers']
};

function detectColumn(headerName) {
  const normalized = headerName.toLowerCase().trim();
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        return field;
      }
    }
  }
  return null;
}

function parseJSONSafe(text) {
  if (!text || text.trim() === '' || text.trim() === '{}') return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// File upload handling
importFile.addEventListener('change', handleFileUpload);

fileDropZone.addEventListener('click', () => {
  importFile.click();
});

fileDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropZone.style.borderColor = '#bc6c25';
  fileDropZone.style.background = '#f6f0e2';
});

fileDropZone.addEventListener('dragleave', () => {
  fileDropZone.style.borderColor = '#a67c52';
  fileDropZone.style.background = '#fffbf3';
});

fileDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropZone.style.borderColor = '#a67c52';
  fileDropZone.style.background = '#fffbf3';
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    importFile.files = files;
    handleFileUpload({ target: { files } });
  }
});

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  importMessage.textContent = 'Parsing file...';
  importMessage.className = 'message';
  
  try {
    const extension = file.name.split('.').pop().toLowerCase();
    let data;
    
    if (extension === 'csv') {
      data = await parseCSV(file);
    } else if (extension === 'xlsx' || extension === 'xls') {
      data = await parseExcel(file);
    } else {
      throw new Error('Unsupported file format. Use .csv or .xlsx');
    }
    
    parsedImportData = data;
    selectedImports = data.map((_, i) => i); // Select all by default
    displayImportPreview();
    importMessage.textContent = '';
    
  } catch (err) {
    importMessage.textContent = '❌ Error: ' + err.message;
    importMessage.className = 'message error';
  }
}

async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsed = parseRows(results.data);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

async function parseExcel(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet);
  return parseRows(jsonData);
}

function parseRows(rows) {
  if (rows.length === 0) {
    throw new Error('File is empty');
  }
  
  // Detect column mappings
  const headers = Object.keys(rows[0]);
  const mapping = {};
  
  headers.forEach(header => {
    const field = detectColumn(header);
    if (field) {
      mapping[header] = field;
    }
  });
  
  console.log('Detected columns:', mapping);
  
  if (!mapping || Object.keys(mapping).length === 0) {
    throw new Error('Could not detect required columns. Please use column names like: Name, Path, Request, Response');
  }
  
  // Check for required columns
  const hasPath = Object.values(mapping).includes('path');
  const hasResponse = Object.values(mapping).includes('response');
  
  if (!hasPath) {
    throw new Error('Required column "Path" not found');
  }
  if (!hasResponse) {
    throw new Error('Required column "Response" not found');
  }
  
  // Transform rows
  return rows.map((row, index) => {
    const transformed = {
      businessName: '',
      path: '',
      method: 'POST',
      latencyMs: 0,
      request: {},
      response: {},
      headers: {},
      query: {},
      responseHeaders: {},
      errors: [],
      rowIndex: index + 2 // +2 because Excel rows start at 1 and we have headers
    };
    
    for (const [header, field] of Object.entries(mapping)) {
      const value = row[header];
      
      if (field === 'request' || field === 'response' || field === 'headers' || field === 'query' || field === 'responseHeaders') {
        if (value && value.trim() !== '') {
          const parsed = parseJSONSafe(value);
          if (parsed === null) {
            transformed.errors.push(`Invalid JSON in ${field}`);
          } else {
            transformed[field] = parsed;
          }
        }
        // If response/responseHeaders are empty/missing, they default to {} 
        // This is valid for 204 No Content, empty DELETE responses, etc.
      } else if (field === 'method') {
        // Normalize method to uppercase
        const methodValue = (value || 'POST').toString().trim().toUpperCase();
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(methodValue)) {
          transformed.method = methodValue;
        } else {
          transformed.method = 'POST'; // Default
        }
      } else if (field === 'latencyMs') {
        // Parse latency as number
        const latency = parseInt(value) || 0;
        transformed.latencyMs = Math.max(0, Math.min(30000, latency)); // Clamp between 0-30000
      } else {
        transformed[field] = value || '';
      }
    }
    
    // Validation
    if (!transformed.path || transformed.path.trim() === '') {
      transformed.errors.push('Path is required');
    }
    // Response can be empty object {} - that's valid for some APIs
    // Only error if response column is missing entirely
    if (transformed.response === undefined || transformed.response === null) {
      transformed.errors.push('Response column is required');
    }
    
    transformed.valid = transformed.errors.length === 0;
    return transformed;
  });
}

function displayImportPreview() {
  const validCount = parsedImportData.filter(d => d.valid).length;
  const invalidCount = parsedImportData.length - validCount;
  
  let html = `
    <div class="import-summary">
      <p><strong>${parsedImportData.length} APIs found</strong></p>
      <p>${validCount} valid | ${invalidCount > 0 ? `⚠️ ${invalidCount} invalid` : ''}</p>
      <label>
        <input type="checkbox" id="selectAllImport" ${selectedImports.length === parsedImportData.length ? 'checked' : ''}> 
        Select All Valid
      </label>
    </div>
    <div class="import-list">
  `;
  
  parsedImportData.forEach((item, index) => {
    const isSelected = selectedImports.includes(index);
    const displayPath = item.path.startsWith('/') ? item.path : `/${item.path}`;
    
    html += `
      <div class="import-item ${item.valid ? '' : 'import-item-invalid'}">
        <div class="import-item-header">
          <label>
            <input type="checkbox" 
                   class="import-checkbox" 
                   data-index="${index}" 
                   ${isSelected && item.valid ? 'checked' : ''} 
                   ${!item.valid ? 'disabled' : ''}>
            ${item.businessName ? `<strong>${item.businessName}</strong>` : displayPath}
          </label>
          ${!item.valid ? '<span class="import-error">❌ Invalid</span>' : ''}
        </div>
        <div class="import-item-details">
          <div><strong>Path:</strong> ${displayPath}</div>
          ${item.businessName ? `<div><strong>Name:</strong> ${item.businessName}</div>` : ''}
          <div><strong>Predicate:</strong> ${Object.keys(item.request).length > 0 ? JSON.stringify(item.request).substring(0, 50) + '...' : 'Any Request'}</div>
          <div><strong>Response:</strong> ${JSON.stringify(item.response).substring(0, 50)}...</div>
          ${item.errors.length > 0 ? `<div class="import-errors">Errors: ${item.errors.join(', ')}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  importPreviewContent.innerHTML = html;
  importPreview.style.display = 'block';
  
  // Add event listeners
  document.getElementById('selectAllImport').addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedImports = parsedImportData.map((item, i) => item.valid ? i : null).filter(i => i !== null);
    } else {
      selectedImports = [];
    }
    displayImportPreview();
  });
  
  document.querySelectorAll('.import-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      if (e.target.checked) {
        if (!selectedImports.includes(index)) {
          selectedImports.push(index);
        }
      } else {
        selectedImports = selectedImports.filter(i => i !== index);
      }
    });
  });
}

cancelImport.addEventListener('click', () => {
  importPreview.style.display = 'none';
  parsedImportData = [];
  selectedImports = [];
  importFile.value = '';
  importMessage.textContent = '';
});

importSelected.addEventListener('click', async () => {
  if (selectedImports.length === 0) {
    alert('Please select at least one mock to import');
    return;
  }
  
  importSelected.disabled = true;
  importSelected.textContent = 'Importing...';
  importMessage.textContent = 'Importing mocks...';
  importMessage.className = 'message';
  
  try {
    const mocksToImport = selectedImports.map(index => {
      const item = parsedImportData[index];
      return {
        businessName: item.businessName || '',
        apiName: item.path.startsWith('/') ? item.path.substring(1) : item.path,
        method: item.method || 'POST',
        latencyMs: item.latencyMs !== undefined ? parseInt(item.latencyMs) : 0,
        predicate: {
          request: item.request || {},
          headers: item.headers || {},
          query: item.query || {}
        },
        requestPayload: {},
        responseHeaders: item.responseHeaders || {},
        responseBody: item.response || {}  // Default to {} if response is undefined
      };
    });
    
    const resp = await fetch('/api/import/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mocks: mocksToImport })
    });
    
    const data = await resp.json();
    
    if (resp.ok) {
      const successCount = data.results.filter(r => r.success).length;
      const failCount = data.results.length - successCount;
      
      importMessage.textContent = `✅ Success! ${successCount} mocks imported${failCount > 0 ? `, ${failCount} failed` : ''}`;
      importMessage.className = 'message success';
      
      // Reset
      importPreview.style.display = 'none';
      parsedImportData = [];
      selectedImports = [];
      importFile.value = '';
      
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        importMessage.textContent = '';
        importMessage.className = 'message';
      }, 3000);
    } else {
      importMessage.textContent = '❌ ' + (data.error || 'Import failed');
      importMessage.className = 'message error';
    }
  } catch (err) {
    importMessage.textContent = '❌ Error: ' + err.message;
    importMessage.className = 'message error';
  } finally {
    importSelected.disabled = false;
    importSelected.textContent = 'Import Selected';
  }
});

// Template downloads
document.getElementById('downloadCsvTemplate').addEventListener('click', () => {
  const csv = `Business Name,API Path,HTTP Method,Latency (ms),Request Headers,Query Parameters,Request Body,Response Headers,Response Body
Admin User Login,/users/login,POST,200,"{""x-api-key"":""admin-key-123""}","{}","{""username"":""admin""}","{""x-powered-by"":""mock-api""}","{""token"":""admin-123"",""role"":""admin""}"
Guest User Login,/users/login,POST,0,"{}","{}","{""username"":""guest""}","{}","{""token"":""guest-456"",""role"":""guest""}"
Get User Profile,/users/profile,GET,100,"{""authorization"":""Bearer *""}","{""userId"":""*""}","{}","{""content-type"":""application/json""}","{""name"":""John Doe"",""email"":""john@example.com""}"
Search Orders,/orders,GET,500,"{}","{""status"":""pending"",""page"":""*""}","{}","{}","{""orders"":[{""id"":1,""status"":""pending""}]}"`;
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mock-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('downloadXlsxTemplate').addEventListener('click', () => {
  const data = [
    ['Business Name', 'API Path', 'HTTP Method', 'Latency (ms)', 'Request Headers', 'Query Parameters', 'Request Body', 'Response Headers', 'Response Body'],
    ['Admin User Login', '/users/login', 'POST', 200, '{"x-api-key":"admin-key-123"}', '{}', '{"username":"admin"}', '{"x-powered-by":"mock-api"}', '{"token":"admin-123","role":"admin"}'],
    ['Guest User Login', '/users/login', 'POST', 0, '{}', '{}', '{"username":"guest"}', '{}', '{"token":"guest-456","role":"guest"}'],
    ['Get User Profile', '/users/profile', 'GET', 100, '{"authorization":"Bearer *"}', '{"userId":"*"}', '{}', '{"content-type":"application/json"}', '{"name":"John Doe","email":"john@example.com"}'],
    ['Search Orders', '/orders', 'GET', 500, '{}', '{"status":"pending","page":"*"}', '{}', '{}', '{"orders":[{"id":1,"status":"pending"}]}']
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mocks');
  XLSX.writeFile(wb, 'mock-import-template.xlsx');
});

// ==================== TEST MODAL FUNCTIONALITY ====================

const testModal = document.getElementById('testModal');
const testMockInfo = document.getElementById('testMockInfo');
const testHeaders = document.getElementById('testHeaders');
const testQuery = document.getElementById('testQuery');
const testBody = document.getElementById('testBody');
const executeTest = document.getElementById('executeTest');
const closeTest = document.getElementById('closeTest');
const testResult = document.getElementById('testResult');
const testResultContent = document.getElementById('testResultContent');

let currentTestMock = null;

// Test mock using index (works for both MongoDB and external mocks)
window.testMockByIndex = async function(mockIndex, apiName, method) {
  try {
    if (mockIndex < 0 || mockIndex >= allMocks.length) {
      showError('Mock not found');
      return;
    }
    
    const mock = allMocks[mockIndex];
    currentTestMock = mock;
    
    // Show modal
    testModal.style.display = 'flex';
    
    // Pre-fill mock information
    testMockInfo.innerHTML = `
      <div style="background: #f6f0e2; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
        <p><strong>Method:</strong> ${method}</p>
        <p><strong>Pattern:</strong> /${apiName}</p>
        <p><strong>Business Name:</strong> ${mock.businessName || 'N/A'}</p>
      </div>
    `;
    
    // Pre-fill test form with mock's predicate data
    const testPathInput = document.getElementById('testPath');
    testPathInput.value = apiName.startsWith('/') ? apiName : `/${apiName}`;
    
    // Pre-fill headers (with actual data from mock)
    const mockHeaders = mock.predicate?.headers || {};
    testHeaders.value = Object.keys(mockHeaders).length > 0 
      ? JSON.stringify(mockHeaders, null, 2)
      : '{}';
    
    // Pre-fill query parameters (with actual data from mock)
    const mockQuery = mock.predicate?.query || {};
    testQuery.value = Object.keys(mockQuery).length > 0
      ? JSON.stringify(mockQuery, null, 2)
      : '{}';
    
    // Pre-fill request body (with actual data from mock)
    // Priority: predicate.request > requestPayload > empty object
    const mockRequest = mock.predicate?.request || {};
    const mockRequestPayload = mock.requestPayload || {};
    
    // Use predicate.request if not empty, otherwise use requestPayload
    const requestBodyToUse = Object.keys(mockRequest).length > 0 
      ? mockRequest 
      : (Object.keys(mockRequestPayload).length > 0 ? mockRequestPayload : {});
    
    testBody.value = Object.keys(requestBodyToUse).length > 0
      ? JSON.stringify(requestBodyToUse, null, 2)
      : '{}';
    
    // Clear previous result
    testResult.style.display = 'none';
    testResultContent.innerHTML = '';
    
  } catch (err) {
    showError('Error opening test modal: ' + err.message);
  }
};

closeTest.addEventListener('click', () => {
  testModal.style.display = 'none';
  currentTestMock = null;
});

// Close modal on outside click
testModal.addEventListener('click', (e) => {
  if (e.target === testModal) {
    testModal.style.display = 'none';
    currentTestMock = null;
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && testModal.style.display === 'flex') {
    testModal.style.display = 'none';
    currentTestMock = null;
  }
});

executeTest.addEventListener('click', async () => {
  if (!currentTestMock) return;
  
  executeTest.disabled = true;
  executeTest.textContent = 'Sending...';
  testResult.style.display = 'none';
  
  try {
    // Parse test inputs
    const headers = parseJSONSafe(testHeaders.value.trim() || '{}');
    const query = parseJSONSafe(testQuery.value.trim() || '{}');
    const body = parseJSONSafe(testBody.value.trim() || '{}');
    
    if (headers === null) {
      testResultContent.innerHTML = '<div style="color: #dc2626;">Invalid Headers JSON</div>';
      testResult.style.display = 'block';
      return;
    }
    if (query === null) {
      testResultContent.innerHTML = '<div style="color: #dc2626;">Invalid Query Parameters JSON</div>';
      testResult.style.display = 'block';
      return;
    }
    if (body === null) {
      testResultContent.innerHTML = '<div style="color: #dc2626;">Invalid Request Body JSON</div>';
      testResult.style.display = 'block';
      return;
    }
    
    // Build query string
    const queryString = Object.keys(query).length > 0
      ? '?' + new URLSearchParams(query).toString()
      : '';
    
    // Build URL from user's test path input
    const testPathInput = document.getElementById('testPath');
    let testPath = testPathInput.value.trim();
    if (!testPath.startsWith('/')) {
      testPath = `/${testPath}`;
    }
    const testUrl = `/mock${testPath}${queryString}`;
    
    // Send test request
    const startTime = performance.now();
    const method = currentTestMock.method || 'POST';
    
    const requestOptions = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (method !== 'GET' && method !== 'HEAD') {
      requestOptions.body = JSON.stringify(body);
    }
    
    const response = await fetch(testUrl, requestOptions);
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    
    // Get response
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    
    // Display result
    const statusColor = response.ok ? '#16a34a' : '#dc2626';
    const statusIcon = response.ok ? '✅' : '❌';
    
    testResultContent.innerHTML = `
      <div style="margin-bottom: 15px;">
        <strong style="color: ${statusColor};">${statusIcon} ${response.status} ${response.statusText}</strong>
        <span style="color: #888; margin-left: 10px;">(${duration}ms)</span>
      </div>
      
      <div style="margin-bottom: 15px;">
        <strong>Request:</strong>
        <pre style="background: #f6f0e2; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 13px;">${method} ${testUrl}
Headers: ${JSON.stringify(headers, null, 2)}
${method !== 'GET' && method !== 'HEAD' ? 'Body: ' + JSON.stringify(body, null, 2) : ''}</pre>
      </div>
      
      <div>
        <strong>Response:</strong>
        <pre style="background: #f6f0e2; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 13px;">${JSON.stringify(responseBody, null, 2)}</pre>
      </div>
    `;
    
    testResult.style.display = 'block';
    
  } catch (err) {
    testResultContent.innerHTML = `
      <div style="color: #dc2626;">
        <strong>❌ Request Failed</strong>
        <pre style="background: #fee; padding: 10px; border-radius: 6px; margin-top: 10px;">${err.message}</pre>
      </div>
    `;
    testResult.style.display = 'block';
  } finally {
    executeTest.disabled = false;
    executeTest.textContent = 'Send Request';
  }
});
