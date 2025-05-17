// Entry point for the Chrome extension content script
console.log("Extension content script loaded.");

// Call backend Faceit proof-of-concept endpoint and show result in a banner

fetch("http://localhost:5000/api/prematch-info?player=ALTR_ABDI")
  .then((r) => r.json())
  .then((data) => {
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.bottom = "0";
    banner.style.right = "0";
    banner.style.width = "33%";
    banner.style.maxHeight = "50vh";
    banner.style.overflowY = "auto";
    banner.style.background = "#222";
    banner.style.color = "#fff";
    banner.style.zIndex = "9999";
    banner.style.textAlign = "center";
    banner.style.fontSize = "18px";
    banner.style.padding = "10px 0";
    banner.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

    // Format Faceit data nicely
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
    } else {
      html += `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }
    banner.innerHTML = html;
    document.body.appendChild(banner);
  })
  .catch((err) => {
    console.error("Error fetching Faceit data:", err);
    const banner = document.createElement("div");
    banner.textContent = `Faceit POC error: ${err}`;
    banner.style.position = "fixed";
    banner.style.bottom = "0";
    banner.style.right = "0";
    banner.style.width = "33%";
    banner.style.background = "#a00";
    banner.style.color = "#fff";
    banner.style.zIndex = "9999";
    banner.style.textAlign = "left";
    banner.style.fontSize = "20px";
    banner.style.padding = "10px 0";
    banner.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    document.body.appendChild(banner);
  });
