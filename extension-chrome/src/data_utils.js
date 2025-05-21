// Data formatting and extraction utilities for Extendo extension

function formatNumber(num) {
  return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "N/A";
}

function calculateWinRate(wins, totalMatches) {
  if (!wins || !totalMatches || totalMatches === 0) return "N/A";
  return ((wins / totalMatches) * 100).toFixed(1) + '%';
}

function extractMapStats(playerData) {
  if (!playerData || !playerData.stats || !playerData.stats.segments) {
    return [];
  }
  return playerData.stats.segments.filter(segment => 
    segment.mode === "5v5" && 
    segment.label && 
    segment.label.includes("Map")
  );
}
