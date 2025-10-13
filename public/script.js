const form = document.getElementById('mockApiForm');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const messageDiv = document.getElementById('message');
const mocksList = document.getElementById('mocksList');
const formTitle = document.getElementById('formTitle');

let currentEditId = null;

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
}

// Save/Update mock
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageDiv.textContent = '';
  messageDiv.className = 'message';

  const businessName = document.getElementById('businessName').value.trim();
  const apiName = document.getElementById('apiName').value.trim();
  const method = document.getElementById('method').value || 'POST';
  const predicateRequestText = document.getElementById('predicateRequest').value.trim();
  const predicateHeadersText = document.getElementById('predicateHeaders').value.trim();
  const predicateQueryText = document.getElementById('predicateQuery').value.trim();
  const requestPayloadText = document.getElementById('requestPayload').value.trim();
  const responseHeadersText = document.getElementById('responseHeaders').value.trim();
  const responseBodyText = document.getElementById('responseBody').value.trim();

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

  const responseBody = parseJSONSafe(responseBodyText);
  if (responseBody === null) return showError('Invalid Response Body JSON');

  if (Object.keys(responseBody).length === 0) {
    return showError('Response Body JSON cannot be empty');
  }

  submitBtn.disabled = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = currentEditId ? 'Updating...' : 'Saving...';

  const payload = {
    businessName,
    apiName,
    method,
    predicate: {
      request: predicateRequest,
      headers: predicateHeaders,
      query: predicateQuery
    },
    requestPayload,
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
    
    if (mocks.length === 0) {
      mocksList.innerHTML = '<p class="empty">No mocks created yet. Create your first mock!</p>';
      return;
    }
    
    // Group by API name
    const grouped = {};
    mocks.forEach(mock => {
      if (!grouped[mock.apiName]) {
        grouped[mock.apiName] = [];
      }
      grouped[mock.apiName].push(mock);
    });
    
    let html = '<div class="mocks-grid">';
    
    Object.keys(grouped).sort().forEach(apiName => {
      const apiMocks = grouped[apiName];
      // Ensure path starts with single slash
      const displayPath = apiName.startsWith('/') ? apiName : `/${apiName}`;
      
      html += `
        <div class="mock-card">
          <div class="mock-header">
            <h3>${displayPath}</h3>
            <span class="mock-count">${apiMocks.length} stub${apiMocks.length > 1 ? 's' : ''}</span>
          </div>
          <div class="mock-stubs">
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
        const businessName = mock.businessName ? `<span class="stub-business-name">${mock.businessName}</span>` : '';
        
        html += `
          <div class="stub-item">
            <div class="stub-info">
              ${businessName}
              <span class="stub-method">${method}</span>
              <span class="stub-predicate">${predicateStr}</span>
              <span class="stub-response">${JSON.stringify(mock.responseBody).substring(0, 50)}...</span>
            </div>
            <div class="stub-actions">
              <button class="btn-edit" onclick="editMock('${mock._id}')">Edit</button>
              <button class="btn-clone" onclick="cloneMock('${mock._id}')">Clone</button>
              <button class="btn-delete" onclick="deleteMock('${mock._id}', '${apiName}')">Delete</button>
            </div>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    mocksList.innerHTML = html;
    
  } catch (err) {
    mocksList.innerHTML = '<p class="error">Error loading mocks: ' + err.message + '</p>';
  }
}

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
    document.getElementById('predicateRequest').value = JSON.stringify(mock.predicate?.request || {}, null, 2);
    document.getElementById('predicateHeaders').value = JSON.stringify(mock.predicate?.headers || {}, null, 2);
    document.getElementById('predicateQuery').value = JSON.stringify(mock.predicate?.query || {}, null, 2);
    document.getElementById('requestPayload').value = JSON.stringify(mock.requestPayload || {}, null, 2);
    document.getElementById('responseHeaders').value = JSON.stringify(mock.responseHeaders || {}, null, 2);
    document.getElementById('responseBody').value = JSON.stringify(mock.responseBody || {}, null, 2);
    
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
    document.getElementById('predicateRequest').value = JSON.stringify(mock.predicate?.request || {}, null, 2);
    document.getElementById('predicateHeaders').value = JSON.stringify(mock.predicate?.headers || {}, null, 2);
    document.getElementById('predicateQuery').value = JSON.stringify(mock.predicate?.query || {}, null, 2);
    document.getElementById('requestPayload').value = JSON.stringify(mock.requestPayload || {}, null, 2);
    document.getElementById('responseHeaders').value = JSON.stringify(mock.responseHeaders || {}, null, 2);
    document.getElementById('responseBody').value = JSON.stringify(mock.responseBody || {}, null, 2);
    
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
  businessName: ['name', 'business name', 'api name', 'description', 'label', 'title'],
  path: ['path', 'api path', 'endpoint', 'url', 'route', 'api', 'uri'],
  method: ['method', 'http method', 'verb', 'http verb'],
  request: ['request', 'request body', 'request payload', 'req body', 'request json', 'input', 'req'],
  response: ['response', 'response body', 'response payload', 'res body', 'response json', 'output', 'res'],
  headers: ['headers', 'request headers', 'header', 'http headers'],
  query: ['query', 'query params', 'query parameters', 'query string', 'url params']
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
      request: {},
      response: {},
      headers: {},
      query: {},
      errors: [],
      rowIndex: index + 2 // +2 because Excel rows start at 1 and we have headers
    };
    
    for (const [header, field] of Object.entries(mapping)) {
      const value = row[header];
      
      if (field === 'request' || field === 'response' || field === 'headers' || field === 'query') {
        if (value && value.trim() !== '') {
          const parsed = parseJSONSafe(value);
          if (parsed === null) {
            transformed.errors.push(`Invalid JSON in ${field}`);
          } else {
            transformed[field] = parsed;
          }
        }
      } else if (field === 'method') {
        // Normalize method to uppercase
        const methodValue = (value || 'POST').toString().trim().toUpperCase();
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(methodValue)) {
          transformed.method = methodValue;
        } else {
          transformed.method = 'POST'; // Default
        }
      } else {
        transformed[field] = value || '';
      }
    }
    
    // Validation
    if (!transformed.path || transformed.path.trim() === '') {
      transformed.errors.push('Path is required');
    }
    if (!transformed.response || Object.keys(transformed.response).length === 0) {
      transformed.errors.push('Response is required');
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
      <p>✅ ${validCount} valid | ${invalidCount > 0 ? `⚠️ ${invalidCount} invalid` : ''}</p>
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
        predicate: {
          request: item.request || {},
          headers: item.headers || {},
          query: item.query || {}
        },
        requestPayload: {},
        responseHeaders: {},
        responseBody: item.response
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
  const csv = `Business Name,API Path,Request Body,Response Body
Admin User Login,/users/login,"{""username"":""admin""}","{""token"":""admin-123"",""role"":""admin""}"
Guest User Login,/users/login,"{""username"":""guest""}","{""token"":""guest-456"",""role"":""guest""}"
Get User Profile,/users/profile,"{}","{""name"":""John Doe"",""email"":""john@example.com""}"`;
  
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
    ['Business Name', 'API Path', 'Request Body', 'Response Body'],
    ['Admin User Login', '/users/login', '{"username":"admin"}', '{"token":"admin-123","role":"admin"}'],
    ['Guest User Login', '/users/login', '{"username":"guest"}', '{"token":"guest-456","role":"guest"}'],
    ['Get User Profile', '/users/profile', '{}', '{"name":"John Doe","email":"john@example.com"}']
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mocks');
  XLSX.writeFile(wb, 'mock-import-template.xlsx');
});
