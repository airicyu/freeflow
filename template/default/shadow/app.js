// Storybook Animation Controller

document.addEventListener('DOMContentLoaded', () => {
  // Animate scenes on scroll
  const scenes = document.querySelectorAll('.scene');
  const magicCards = document.querySelectorAll('.magic-card');
  
  const observerOptions = {
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Set initial state and observe
  scenes.forEach((scene, index) => {
    scene.style.opacity = '0';
    scene.style.transform = 'translateY(30px)';
    scene.style.transition = `opacity 0.6s ease ${index * 0.15}s, transform 0.6s ease ${index * 0.15}s`;
    observer.observe(scene);
  });

  magicCards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
    observer.observe(card);
  });

  // Interactive character wave on click
  document.querySelectorAll('.avatar').forEach(avatar => {
    avatar.addEventListener('click', () => {
      avatar.style.animation = 'wave 0.5s ease';
      setTimeout(() => {
        avatar.style.animation = '';
      }, 500);
    });
  });

  // Add wave animation style
  const style = document.createElement('style');
  style.textContent = `
    @keyframes wave {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-10deg); }
      75% { transform: rotate(10deg); }
    }
  `;
  document.head.appendChild(style);

  // Hover effect on preview checkboxes
  document.querySelectorAll('.task-check').forEach(check => {
    check.addEventListener('click', () => {
      check.classList.toggle('checked');
      const taskSpan = check.nextElementSibling;
      if (check.classList.contains('checked')) {
        taskSpan.style.textDecoration = 'line-through';
        taskSpan.style.color = '#aaa';
      } else {
        taskSpan.style.textDecoration = 'none';
        taskSpan.style.color = '#555';
      }
    });
  });

  // Summary section animation
  const summarySection = document.querySelector('.summary-section');
  if (summarySection) {
    summarySection.style.opacity = '0';
    summarySection.style.transform = 'scale(0.95)';
    summarySection.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
    
    const summaryObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'scale(1)';
        }
      });
    }, { threshold: 0.3 });
    
    summaryObserver.observe(summarySection);
  }
});
