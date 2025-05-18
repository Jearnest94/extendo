// Entry point for the Chrome extension content script

// Inject global stylesheet for extension UI polish

function injectExtendoStylesheet() {
  if (document.getElementById('extendo-style')) return;
  const style = document.createElement('link');
  style.id = 'extendo-style';
  style.rel = 'stylesheet';
  style.type = 'text/css';
  style.href = chrome.runtime.getURL('style.css');
  document.head.appendChild(style);
}

function removeExistingBanner() {
  const old = document.querySelector('.extendo-faceit-banner');
  if (old) old.remove();
}

injectExtendoStylesheet();

console.log("Extension content script loaded.");

// Call backend Faceit proof-of-concept endpoint and show result in a banner


removeExistingBanner();
fetch("http://localhost:5000/api/prematch-info?player=ALTR_ABDI")
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    removeExistingBanner();
    const banner = document.createElement("div");
    banner.className = "extendo-faceit-banner";
    let html = "<b>Faceit POC:</b><br>";
    if (Array.isArray(data) && data.length && data[0].nickname) {
      console.log("Faceit data:", data);
      html += `<b>${data.length} players:</b><br>`;
      const p = data[0];
      html += `<img src='${p.avatar || ""}' style='height:40px;border-radius:50%;vertical-align:left;margin-right:8px;'>`;
      html += `<b>${p.nickname}</b><br>`;
      html += `Country: ${p.country || ""}<br>`;
      html += `Level: ${p.skill_level || "?"}<br>`;
      html += `<a href='https://www.faceit.com/en/players/${p.nickname}' target='_blank' style='color:#4af'>Faceit Profile</a>`;
    } else if (data && Object.keys(data).length) {
      html += `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    } else {
      html += `<i>No data available.</i>`;
    }
    banner.innerHTML = html;
    document.body.appendChild(banner);
  })
  .catch((err) => {
    removeExistingBanner();
    console.error("Error fetching Faceit data:", err);
    const banner = document.createElement("div");
    banner.className = "extendo-faceit-banner extendo-faceit-banner-error";
    banner.textContent = `Faceit POC error: ${err}`;
    document.body.appendChild(banner);
  });
