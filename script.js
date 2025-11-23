let progress = 0;
const fill = document.getElementById('progressFill');
const infoCard = document.getElementById('infoCard');

const interval = setInterval(() => {
  progress += 2.5; // +2.5% every tick
  if(progress > 100) progress = 100;
  
  fill.style.width = progress + '%';
  fill.textContent = Math.floor(progress) + '%';

  if(progress >= 100) {
    clearInterval(interval);
    fill.textContent = '✅ Loaded!';
    setTimeout(() => {
      fill.style.display = 'none';
      infoCard.style.display = 'block';
    }, 500); // small delay before showing info
  }
}, 250); // every 0.25 sec
