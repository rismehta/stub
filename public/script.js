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

  const apiName = document.getElementById('apiName').value.trim();
  const predicateRequestText = document.getElementById('predicateRequest').value.trim();
  const predicateHeadersText = document.getElementById('predicateHeaders').value.trim();
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
    apiName,
    predicate: {
      request: predicateRequest,
      headers: predicateHeaders
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
        const predicateInfo = [];
        if (hasBodyPred) predicateInfo.push('Body Match');
        if (hasHeaderPred) predicateInfo.push('Header Match');
        const predicateStr = predicateInfo.length > 0 ? predicateInfo.join(' + ') : 'Any Request';
        
        html += `
          <div class="stub-item">
            <div class="stub-info">
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
    document.getElementById('apiName').value = mock.apiName;
    document.getElementById('predicateRequest').value = JSON.stringify(mock.predicate?.request || {}, null, 2);
    document.getElementById('predicateHeaders').value = JSON.stringify(mock.predicate?.headers || {}, null, 2);
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
    document.getElementById('apiName').value = mock.apiName;
    document.getElementById('predicateRequest').value = JSON.stringify(mock.predicate?.request || {}, null, 2);
    document.getElementById('predicateHeaders').value = JSON.stringify(mock.predicate?.headers || {}, null, 2);
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
