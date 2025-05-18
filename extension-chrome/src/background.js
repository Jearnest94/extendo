// Ping backend health endpoint and log result
fetch('http://localhost:5000/api/health')
  .then(r => r.json())
  .then(data => {
    console.log('[Extendo] Backend health:', data);
  })
  .catch(err => {
    console.error('[Extendo] Backend health check failed:', err);
  });
