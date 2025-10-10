# Working `inject` Function (If You Need It)

If you need dynamic behavior (auth passthrough, conditional responses), here's the fixed inject:

```javascript
// Working inject function
const responseBodyStr = JSON.stringify(doc.responseBody || {});
const responseHeadersStr = JSON.stringify(doc.responseHeaders || {});

const injectFn = `function (request) {
  const responseBody = ${responseBodyStr};
  const userHeaders = ${responseHeadersStr};
  const authHeader = request.headers['authorization'] || '';
  const combinedHeaders = Object.assign({}, userHeaders, {
    'content-type': 'application/json'
  });
  if (authHeader) {
    combinedHeaders['authorization'] = authHeader;
  }
  return {
    statusCode: 200,
    headers: combinedHeaders,
    body: responseBody
  };
}`;

return {
  predicates,
  responses: [{ inject: injectFn }]
};
```

## Key Fixes:
1. ✅ Removed unnecessary newlines
2. ✅ Used `const` instead of `var`
3. ✅ Proper function signature: `function (request)`
4. ✅ Ensured content-type is always set

## To Use This:
Replace the `buildStubs` function in `routes/Api.js` with the inject version above.

## When to Use Which

### Use `is` (current) when:
- Simple mock responses
- No need for dynamic behavior
- Maximum reliability wanted

### Use `inject` when:
- Need auth header passthrough
- Need conditional responses
- Need request inspection
- Need dynamic transformations


