const form = document.getElementById('mockApiForm');
const submitBtn = document.getElementById('submitBtn');
const messageDiv = document.getElementById('message');

function parseJSONSafe(text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {

    return null;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageDiv.textContent = '';
  messageDiv.className = 'message';

  const apiName = document.getElementById('apiName').value.trim();
  const predicateRequestText = document.getElementById('predicateRequest').value.trim();
  const requestPayloadText = document.getElementById('requestPayload').value.trim();
  const responseHeadersText = document.getElementById('responseHeaders').value.trim();
  const responseBodyText = document.getElementById('responseBody').value.trim();

  if (!apiName) {
    messageDiv.textContent = 'API Name is required';
    messageDiv.classList.add('error');
    return;
  }

  const predicateRequest = parseJSONSafe(predicateRequestText);
  if (predicateRequest === null) return showError('Invalid Request Body Matching Criteria');

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

  const payload = {
    apiName,
    predicate: { request: predicateRequest },
    requestPayload,
    responseHeaders,
    responseBody,
  };

  try {
    const resp = await fetch('/api/saveOrUpdate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (resp.ok) {
      showSuccess(`Success! API running on port ${data.port}`);
      form.reset();
    } else {
      showError(data.error || 'Server error');
    }
  } catch (e) {
    showError('Network or server error');
  } finally {
    submitBtn.disabled = false;
  }
});

function showError(msg) {
  messageDiv.textContent = msg;
  messageDiv.className = 'message error';
}
function showSuccess(msg) {
  messageDiv.textContent = msg;
  messageDiv.className = 'message success';
}
