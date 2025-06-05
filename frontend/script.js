// Configuration de l'API
const API_BASE_URL = 'http://localhost:3001/api';

// État global de l'application
let tasks = [];
let currentFilter = 'all';
let currentSort = 'date';
let isRecording = false;
let recognition = null;
let editingTaskId = null;
let recognitionTimeout = null;

// Variables pour la réécriture IA
let currentRewriteTaskId = null;
let currentRewrittenText = '';
let currentRewriteTarget = 'title';

// Éléments DOM
const elements = {
  taskTitle: document.getElementById('taskTitle'),
  taskDescription: document.getElementById('taskDescription'),
  taskPriority: document.getElementById('taskPriority'),
  taskDueDate: document.getElementById('taskDueDate'),
  taskTags: document.getElementById('taskTags'),
  addTaskBtn: document.getElementById('addTaskBtn'),
  voiceBtn: document.getElementById('voiceBtn'),
  testMicBtn: document.getElementById('testMicBtn'),
  voiceIndicator: document.getElementById('voiceIndicator'),
  stopVoiceBtn: document.getElementById('stopVoiceBtn'),
  tasksList: document.getElementById('tasksList'),
  emptyState: document.getElementById('emptyState'),
  taskCounter: document.getElementById('taskCounter'),
  exportBtn: document.getElementById('exportBtn'),
  filterBtns: document.querySelectorAll('.filter-btn'),
  sortSelect: document.getElementById('sortSelect'),
  editModal: document.getElementById('editModal'),
  editTitle: document.getElementById('editTitle'),
  editDescription: document.getElementById('editDescription'),
  editPriority: document.getElementById('editPriority'),
  editDueDate: document.getElementById('editDueDate'),
  editTags: document.getElementById('editTags'),
  closeModal: document.getElementById('closeModal'),
  rewriteModal: document.getElementById('rewriteModal'),
  closeRewriteModal: document.getElementById('closeRewriteModal'),
  cancelRewrite: document.getElementById('cancelRewrite'),
  acceptRewrite: document.getElementById('acceptRewrite'),
  originalText: document.getElementById('originalText'),
  rewrittenText: document.getElementById('rewrittenText'),
  rewriteStyle: document.getElementById('rewriteStyle'),
  regenerateBtn: document.getElementById('regenerateBtn'),
  cancelEdit: document.getElementById('cancelEdit'),
  saveEdit: document.getElementById('saveEdit'),
  notifications: document.getElementById('notifications')
};

// ================================
// INITIALISATION
// ================================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  setupSpeechRecognition();
});

async function initializeApp() {
  showNotification('Chargement des tâches...', 'info');
  await loadTasks();
  updateUI();
}

// ================================
// GESTION DES ÉVÉNEMENTS
// ================================

function setupEventListeners() {
  // Ajout de tâche
  elements.addTaskBtn.addEventListener('click', handleAddTask);
  elements.taskTitle.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  // Filtres et tri
  elements.filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => handleFilterChange(e.target.dataset.filter));
  });
  elements.sortSelect.addEventListener('change', (e) => handleSortChange(e.target.value));

  // Export
  elements.exportBtn.addEventListener('click', handleExport);

  // Réécriture IA
  elements.closeRewriteModal.addEventListener('click', closeRewriteModal);
  elements.cancelRewrite.addEventListener('click', closeRewriteModal);
  elements.acceptRewrite.addEventListener('click', acceptRewrite);
  elements.regenerateBtn.addEventListener('click', regenerateRewrite);
  elements.rewriteModal.addEventListener('click', (e) => {
    if (e.target === elements.rewriteModal) closeRewriteModal();
  });

  // Modal d'édition
  elements.closeModal.addEventListener('click', closeEditModal);
  elements.cancelEdit.addEventListener('click', closeEditModal);
  elements.saveEdit.addEventListener('click', handleSaveEdit);
  elements.editModal.addEventListener('click', (e) => {
    if (e.target === elements.editModal) closeEditModal();
  });

  // Échap pour fermer les modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeRewriteModal();
      if (isRecording) stopVoiceRecording();
    }
  });

  // Nettoyage avant fermeture de page
  window.addEventListener('beforeunload', cleanupSpeechRecognition);
}

function setupVoiceEventListeners() {
  // Supprimer les anciens listeners pour éviter les doublons
  if (elements.voiceBtn) {
    const newVoiceBtn = elements.voiceBtn.cloneNode(true);
    elements.voiceBtn.parentNode.replaceChild(newVoiceBtn, elements.voiceBtn);
    elements.voiceBtn = newVoiceBtn;
    elements.voiceBtn.addEventListener('click', toggleVoiceRecording);
  }

  if (elements.stopVoiceBtn) {
    const newStopBtn = elements.stopVoiceBtn.cloneNode(true);
    elements.stopVoiceBtn.parentNode.replaceChild(newStopBtn, elements.stopVoiceBtn);
    elements.stopVoiceBtn = newStopBtn;
    elements.stopVoiceBtn.addEventListener('click', stopVoiceRecording);
  }

  if (elements.testMicBtn) {
    const newTestBtn = elements.testMicBtn.cloneNode(true);
    elements.testMicBtn.parentNode.replaceChild(newTestBtn, elements.testMicBtn);
    elements.testMicBtn = newTestBtn;
    elements.testMicBtn.addEventListener('click', testMicrophone);
  }
}

// ================================
// RECONNAISSANCE VOCALE
// ================================

function setupSpeechRecognition() {
  // Vérification du support HTTPS/localhost
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    console.warn('⚠️ La reconnaissance vocale nécessite HTTPS ou localhost');
    hideVoiceElements();
    showNotification('La reconnaissance vocale nécessite HTTPS ou localhost', 'warning');
    return;
  }

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.error('❌ SpeechRecognition non supporté');
    hideVoiceElements();
    showNotification('La reconnaissance vocale n\'est pas supportée par votre navigateur', 'warning');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  // Configuration optimisée
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'fr-FR';
  recognition.maxAlternatives = 1;
  
  // Configuration pour WebKit
  if ('webkitSpeechRecognition' in window) {
    recognition.webkitContinuous = false;
    recognition.webkitInterimResults = false;
  }

  // Événements de reconnaissance
  recognition.onstart = () => {
    console.log('🎤 Reconnaissance vocale démarrée');
    isRecording = true;
    elements.voiceBtn.classList.add('recording');
    elements.voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
    elements.voiceIndicator.classList.remove('hidden');
    showNotification('🎤 Parlez maintenant... (cliquez pour arrêter)', 'info');
  };

  recognition.onresult = (event) => {
    console.log('🎯 Résultat reçu:', event);
    
    if (event.results && event.results.length > 0) {
      const result = event.results[0];
      
      if (result && result[0]) {
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence || 0;
        
        console.log(`✅ Texte: "${transcript}", Confiance: ${confidence}`);
        
        if (transcript && transcript.length > 2) {
          handleVoiceResult(transcript);
        } else {
          console.log('❌ Transcript trop court');
          showNotification('Texte trop court, veuillez réessayer', 'warning');
        }
      }
    } else {
      showNotification('Aucun résultat de reconnaissance, veuillez réessayer', 'warning');
    }
  };

  recognition.onerror = (event) => {
    console.error('❌ Erreur reconnaissance:', event.error);
    
    // Nettoyer le timeout
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
    }
    
    let errorMessage = 'Erreur de reconnaissance vocale';
    
    switch(event.error) {
      case 'not-allowed':
        errorMessage = '🚫 Microphone non autorisé. Cliquez sur l\'icône 🔒 dans la barre d\'adresse.';
        break;
      case 'no-speech':
        errorMessage = '🔇 Aucune parole détectée. Parlez plus fort.';
        break;
      case 'network':
        errorMessage = '🌐 Erreur réseau. Vérifiez votre connexion.';
        break;
      case 'audio-capture':
        errorMessage = '🎤 Microphone non disponible.';
        break;
      case 'service-not-allowed':
        errorMessage = '⚠️ Service non autorisé. Utilisez HTTPS ou localhost.';
        break;
      case 'aborted':
        if (isRecording) {
          errorMessage = '⏹️ Reconnaissance annulée.';
        } else {
          return; // Arrêt volontaire
        }
        break;
      default:
        errorMessage = `Erreur: ${event.error}`;
    }
    
    showNotification(errorMessage, 'error');
    stopVoiceRecording();
  };

  recognition.onend = () => {
    console.log('🔚 Reconnaissance terminée');
    stopVoiceRecording();
  };

  recognition.onspeechstart = () => {
    console.log('🗣️ Parole détectée');
    showNotification('Parole détectée...', 'info');
  };

  recognition.onspeechend = () => {
    console.log('🤐 Fin de parole');
  };

  console.log('✅ Reconnaissance vocale initialisée');
  setupVoiceEventListeners();
}

function toggleVoiceRecording() {
  console.log('🎯 Toggle voice recording, isRecording:', isRecording);
  
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

function startVoiceRecording() {
  if (!recognition) {
    console.error('❌ Recognition non initialisée');
    showNotification('Reconnaissance vocale non initialisée. Rechargez la page.', 'error');
    return;
  }

  if (isRecording) {
    console.warn('⚠️ Reconnaissance déjà en cours');
    return;
  }
  
  try {
    console.log('🚀 Démarrage reconnaissance...');
    
    // Reset état
    isRecording = false;
    
    // Timeout de sécurité (30 secondes)
    recognitionTimeout = setTimeout(() => {
      console.log('⏰ Timeout reconnaissance');
      stopVoiceRecording();
      showNotification('Timeout de reconnaissance (30s)', 'warning');
    }, 30000);
    
    // Vérifier permissions microphone d'abord
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Fermer immédiatement, on voulait juste vérifier
        stream.getTracks().forEach(track => track.stop());
        
        // Démarrer reconnaissance
        recognition.start();
        console.log('🎤 Recognition.start() appelée');
      })
      .catch(error => {
        console.error('❌ Erreur permissions:', error);
        
        if (recognitionTimeout) {
          clearTimeout(recognitionTimeout);
          recognitionTimeout = null;
        }
        
        if (error.name === 'NotAllowedError') {
          showNotification('🚫 Veuillez autoriser l\'accès au microphone', 'error');
        } else {
          showNotification('❌ Erreur microphone: ' + error.message, 'error');
        }
      });
      
  } catch (error) {
    console.error('❌ Erreur démarrage:', error);
    
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
    }
    
    showNotification('Impossible de démarrer la reconnaissance: ' + error.message, 'error');
  }
}

function stopVoiceRecording() {
  console.log('🛑 Arrêt reconnaissance');
  
  // Nettoyer timeout
  if (recognitionTimeout) {
    clearTimeout(recognitionTimeout);
    recognitionTimeout = null;
  }
  
  if (recognition && isRecording) {
    try {
      recognition.stop();
      console.log('🛑 recognition.stop() appelée');
    } catch (error) {
      console.error('Erreur arrêt:', error);
    }
  }
  
  // Reset complet état
  isRecording = false;
  elements.voiceBtn.classList.remove('recording');
  elements.voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  elements.voiceIndicator.classList.add('hidden');
}

async function handleVoiceResult(transcript) {
  console.log(`🎯 Traitement résultat vocal: "${transcript}"`);
  showNotification(`Texte reconnu: "${transcript}"`, 'info');
  
  try {
    // Essayer l'API pour analyse intelligente
    const response = await fetch(`${API_BASE_URL}/tasks/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ transcript })
    });

    if (response.ok) {
      const newTask = await response.json();
      tasks.unshift(newTask);
      updateUI();
      showNotification('✅ Tâche créée par commande vocale!', 'success');
    } else {
      throw new Error('Erreur API création tâche vocale');
    }
  } catch (error) {
    console.error('Erreur API:', error);
    console.log('📝 Fallback: remplissage formulaire');
    
    // Fallback: remplir le formulaire
    elements.taskTitle.value = transcript;
    elements.taskTitle.focus();
    showNotification('Texte ajouté au formulaire. Créez la tâche manuellement.', 'warning');
  }
}

async function testMicrophone() {
  try {
    console.log('🔍 Test microphone...');
    showNotification('Test microphone en cours...', 'info');
    
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const audioTracks = stream.getAudioTracks();
    console.log('🎤 Pistes audio:', audioTracks.length);
    
    if (audioTracks.length === 0) {
      throw new Error('Aucune piste audio disponible');
    }
    
    // Test niveau audio
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    let hasAudio = false;
    const testDuration = 2000;
    const startTime = Date.now();
    
    const checkAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      
      if (average > 10) {
        hasAudio = true;
      }
      
      if (Date.now() - startTime < testDuration && !hasAudio) {
        requestAnimationFrame(checkAudio);
      } else {
        // Nettoyer
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
        
        if (hasAudio) {
          showNotification('✅ Microphone fonctionne ! Son détecté.', 'success');
        } else {
          showNotification('⚠️ Microphone autorisé mais aucun son détecté.', 'warning');
        }
      }
    };
    
    checkAudio();
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      showNotification('🎤 Reconnaissance vocale disponible !', 'success');
    }
    
  } catch (error) {
    console.error('❌ Erreur test microphone:', error);
    
    let message = 'Erreur accès microphone';
    if (error.name === 'NotAllowedError') {
      message = '❌ Accès microphone refusé. Autorisez dans le navigateur.';
    } else if (error.name === 'NotFoundError') {
      message = '❌ Aucun microphone détecté.';
    } else if (error.name === 'NotReadableError') {
      message = '❌ Microphone utilisé par autre application.';
    } else {
      message = `❌ Erreur microphone: ${error.message}`;
    }
    
    showNotification(message, 'error');
  }
}

function hideVoiceElements() {
  if (elements.voiceBtn) elements.voiceBtn.style.display = 'none';
  if (elements.testMicBtn) elements.testMicBtn.style.display = 'none';
}

function cleanupSpeechRecognition() {
  if (recognitionTimeout) {
    clearTimeout(recognitionTimeout);
    recognitionTimeout = null;
  }
  
  if (recognition && isRecording) {
    try {
      recognition.stop();
    } catch (e) {
      // Ignorer erreurs de nettoyage
    }
  }
  
  isRecording = false;
}

function diagnoseSpeechRecognition() {
  console.log('🔍 === DIAGNOSTIC RECONNAISSANCE VOCALE ===');
  console.log('🌐 Protocol:', location.protocol);
  console.log('🏠 Hostname:', location.hostname);
  console.log('🎤 SpeechRecognition:', 'SpeechRecognition' in window);
  console.log('🎤 webkitSpeechRecognition:', 'webkitSpeechRecognition' in window);
  console.log('📱 User Agent:', navigator.userAgent);
  console.log('🔊 Media Devices:', !!navigator.mediaDevices);
  console.log('🎥 getUserMedia:', !!navigator.mediaDevices?.getUserMedia);
  
  navigator.permissions?.query({ name: 'microphone' })
    .then(permission => {
      console.log('🔒 Permission microphone:', permission.state);
    })
    .catch(e => console.log('🔒 Impossible vérifier permissions:', e));
    
  console.log('🔍 === FIN DIAGNOSTIC ===');
}

// Mode debug
if (window.location.search.includes('debug')) {
  document.addEventListener('DOMContentLoaded', diagnoseSpeechRecognition);
}

// ================================
// RÉÉCRITURE IA
// ================================

async function handleRewriteTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  currentRewriteTaskId = taskId;
  elements.rewriteModal.classList.remove('hidden');
  
  const radioButtons = document.querySelectorAll('input[name="rewriteTarget"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      currentRewriteTarget = radio.value;
      updateOriginalText(task);
    });
  });
  
  updateOriginalText(task);
  await performRewrite(task);
}

function updateOriginalText(task) {
  const selectedTarget = document.querySelector('input[name="rewriteTarget"]:checked').value;
  let originalContent = '';
  
  switch (selectedTarget) {
    case 'title':
      originalContent = task.title;
      break;
    case 'description':
      originalContent = task.description || '(Aucune description)';
      break;
    case 'both':
      originalContent = `📝 Titre: ${task.title}\n\n📄 Description: ${task.description || '(Aucune description)'}`;
      break;
  }
  
  elements.originalText.textContent = originalContent;
}

async function performRewrite(task) {
  const selectedTarget = document.querySelector('input[name="rewriteTarget"]:checked').value;
  let textToRewrite = '';
  
  switch (selectedTarget) {
    case 'title':
      textToRewrite = task.title;
      break;
    case 'description':
      textToRewrite = task.description || 'Aucune description disponible';
      if (!task.description || task.description.trim() === '') {
        textToRewrite = `Développer une description pour: ${task.title}`;
      }
      break;
    case 'both':
      if (task.description && task.description.trim()) {
        textToRewrite = `Titre: ${task.title}\n\nDescription: ${task.description}`;
      } else {
        textToRewrite = `Créer un titre professionnel et une description détaillée pour cette tâche: ${task.title}`;
      }
      break;
  }
  
  await rewriteWithPerplexity(textToRewrite);
}

async function rewriteWithPerplexity(text, style = 'professional') {
  elements.rewrittenText.innerHTML = `
    <div class="loading-rewrite">
      <div class="ai-spinner"></div>
      <p>🤖 Perplexity AI reformule votre texte...</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE_URL}/ai/rewrite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        text: text,
        style: style
      })
    });

    if (!response.ok) {
      throw new Error('Erreur lors de la réécriture');
    }

    const result = await response.json();
    
    if (result.success) {
      currentRewrittenText = result.rewrittenText
        .replace(/^["']|["']$/g, '')
        .replace(/^"|"$/g, '')
        .replace(/^\s+|\s+$/g, '')
        .trim();
        
      elements.rewrittenText.innerHTML = `
        <div style="white-space: pre-wrap;">${escapeHtml(currentRewrittenText)}</div>
      `;
      showNotification('✨ Réécriture terminée !', 'success');
    } else {
      throw new Error(result.error || 'Erreur inconnue');
    }
    
  } catch (error) {
    console.error('Erreur réécriture:', error);
    elements.rewrittenText.innerHTML = `
      <div style="color: #ef4444; text-align: center; padding: 20px;">
        ❌ Erreur lors de la réécriture<br>
        <small>${error.message}</small>
      </div>
    `;
    showNotification('Erreur lors de la réécriture IA', 'error');
  }
}

async function regenerateRewrite() {
  const task = tasks.find(t => t.id === currentRewriteTaskId);
  if (!task) return;
  
  const selectedStyle = elements.rewriteStyle.value;
  const selectedTarget = document.querySelector('input[name="rewriteTarget"]:checked').value;
  
  let textToRewrite = '';
  switch (selectedTarget) {
    case 'title':
      textToRewrite = task.title;
      break;
    case 'description':
      textToRewrite = task.description || 'Aucune description à réécrire';
      break;
    case 'both':
      textToRewrite = `${task.title}${task.description ? '\n\n' + task.description : ''}`;
      break;
  }
  
  await rewriteWithPerplexity(textToRewrite, selectedStyle);
}

async function acceptRewrite() {
  if (!currentRewriteTaskId || !currentRewrittenText) {
    showNotification('Aucune réécriture à accepter', 'warning');
    return;
  }

  try {
    const task = tasks.find(t => t.id === currentRewriteTaskId);
    if (!task) return;
    
    const selectedTarget = document.querySelector('input[name="rewriteTarget"]:checked').value;

    let cleanedText = currentRewrittenText
      .replace(/^["']|["']$/g, '')
      .replace(/^"|"$/g, '')
      .trim();

    let updates = {};

    switch (selectedTarget) {
      case 'title':
        updates.title = cleanedText.length > 100 ? cleanedText.substring(0, 100).trim() + '...' : cleanedText;
        updates.description = task.description || '';
        break;
        
      case 'description':
        updates.title = task.title;
        updates.description = cleanedText;
        break;
        
      case 'both':
        let titlePart = '';
        let descriptionPart = '';
        
        const sentenceSplit = cleanedText.match(/^([^.!?]*[.!?])\s*(.*)$/s);
        if (sentenceSplit && sentenceSplit[1].length < 120) {
          titlePart = sentenceSplit[1].replace(/[.!?]$/, '').trim();
          descriptionPart = sentenceSplit[2].trim();
        }
        else if (cleanedText.includes('\n')) {
          const lines = cleanedText.split('\n').filter(line => line.trim());
          titlePart = lines[0].trim();
          descriptionPart = lines.slice(1).join('\n').trim();
        }
        else if (cleanedText.length > 80) {
          const colonIndex = cleanedText.indexOf(':', 30);
          const commaIndex = cleanedText.indexOf(',', 30);
          
          let splitIndex = -1;
          if (colonIndex > 0 && colonIndex < 100) splitIndex = colonIndex;
          else if (commaIndex > 0 && commaIndex < 100) splitIndex = commaIndex;
          
          if (splitIndex > 0) {
            titlePart = cleanedText.substring(0, splitIndex).trim();
            descriptionPart = cleanedText.substring(splitIndex + 1).trim();
          } else {
            const spaceIndex = cleanedText.lastIndexOf(' ', 80);
            if (spaceIndex > 30) {
              titlePart = cleanedText.substring(0, spaceIndex).trim();
              descriptionPart = cleanedText.substring(spaceIndex).trim();
            }
          }
        }
        
        if (!titlePart) {
          if (cleanedText.length <= 100) {
            titlePart = cleanedText;
            descriptionPart = '';
          } else {
            const lastSpace = cleanedText.lastIndexOf(' ', 80);
            titlePart = cleanedText.substring(0, lastSpace > 30 ? lastSpace : 80).trim();
            descriptionPart = cleanedText.substring(lastSpace > 30 ? lastSpace : 80).trim();
          }
        }
        
        updates.title = titlePart;
        updates.description = descriptionPart;
        break;
    }

    const response = await fetch(`${API_BASE_URL}/tasks/${currentRewriteTaskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (response.ok) {
      const updatedTask = await response.json();
      const index = tasks.findIndex(t => t.id === currentRewriteTaskId);
      tasks[index] = updatedTask;
      closeRewriteModal();
      updateUI();
      
      const targetNames = {
        'title': 'titre',
        'description': 'description',
        'both': 'titre et description'
      };
      
      showNotification(`✨ ${targetNames[selectedTarget]} réécrit(e) avec succès !`, 'success');
    } else {
      throw new Error('Erreur lors de la mise à jour');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de l\'application de la réécriture', 'error');
  }
}

function closeRewriteModal() {
  elements.rewriteModal.classList.add('hidden');
  currentRewriteTaskId = null;
  currentRewrittenText = '';
}

// ================================
// GESTION DES TÂCHES
// ================================

async function handleAddTask() {
  const title = elements.taskTitle.value.trim();
  if (!title) {
    showNotification('Le titre de la tâche est requis', 'warning');
    elements.taskTitle.focus();
    return;
  }

  const taskData = {
    title,
    description: elements.taskDescription.value.trim(),
    priority: elements.taskPriority.value,
    dueDate: elements.taskDueDate.value || null,
    tags: elements.taskTags.value.trim()
  };

  try {
    elements.addTaskBtn.classList.add('loading');
    
    const response = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });

    if (response.ok) {
      const newTask = await response.json();
      tasks.unshift(newTask);
      clearForm();
      updateUI();
      showNotification('Tâche ajoutée avec succès!', 'success');
    } else {
      throw new Error('Erreur lors de l\'ajout de la tâche');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de l\'ajout de la tâche', 'error');
  } finally {
    elements.addTaskBtn.classList.remove('loading');
  }
}

async function handleToggleComplete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  try {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ completed: !task.completed })
    });

    if (response.ok) {
      const updatedTask = await response.json();
      const index = tasks.findIndex(t => t.id === taskId);
      tasks[index] = updatedTask;
      updateUI();
      showNotification(
        updatedTask.completed ? 'Tâche terminée!' : 'Tâche marquée comme à faire',
        'success'
      );
    } else {
      throw new Error('Erreur lors de la mise à jour');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la mise à jour', 'error');
  }
}

async function handleChangeStatus(taskId, newStatus) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  try {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (response.ok) {
      const updatedTask = await response.json();
      const index = tasks.findIndex(t => t.id === taskId);
      tasks[index] = updatedTask;
      updateUI();
      
      const statusMessages = {
        'todo': 'Tâche remise à faire',
        'in_progress': 'Tâche mise en cours',
        'completed': 'Tâche terminée!'
      };
      
      showNotification(statusMessages[newStatus], 'success');
    } else {
      throw new Error('Erreur lors de la mise à jour');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la mise à jour', 'error');
  }
}

async function handleDeleteTask(taskId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette tâche?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      tasks = tasks.filter(t => t.id !== taskId);
      updateUI();
      showNotification('Tâche supprimée', 'success');
    } else {
      throw new Error('Erreur lors de la suppression');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
}

function handleEditTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;
  elements.editTitle.value = task.title;
  elements.editDescription.value = task.description || '';
  elements.editPriority.value = task.priority;
  elements.editDueDate.value = task.dueDate ? task.dueDate.split('T')[0] : '';
  elements.editTags.value = task.tags || '';
  
  elements.editModal.classList.remove('hidden');
  elements.editTitle.focus();
}

async function handleSaveEdit() {
  if (!editingTaskId) return;

  const updates = {
    title: elements.editTitle.value.trim(),
    description: elements.editDescription.value.trim(),
    priority: elements.editPriority.value,
    dueDate: elements.editDueDate.value || null,
    tags: elements.editTags.value.trim()
  };

  if (!updates.title) {
    showNotification('Le titre est requis', 'warning');
    elements.editTitle.focus();
    return;
  }

  try {
    elements.saveEdit.classList.add('loading');
    
    const response = await fetch(`${API_BASE_URL}/tasks/${editingTaskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (response.ok) {
      const updatedTask = await response.json();
      const index = tasks.findIndex(t => t.id === editingTaskId);
      tasks[index] = updatedTask;
      closeEditModal();
      updateUI();
      showNotification('Tâche mise à jour!', 'success');
    } else {
      throw new Error('Erreur lors de la mise à jour');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la mise à jour', 'error');
  } finally {
    elements.saveEdit.classList.remove('loading');
  }
}

function closeEditModal() {
  elements.editModal.classList.add('hidden');
  editingTaskId = null;
}

async function loadTasks() {
  try {
    const response = await fetch(`${API_BASE_URL}/tasks`);
    if (response.ok) {
      tasks = await response.json();
    } else {
      throw new Error('Erreur lors du chargement des tâches');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors du chargement des tâches', 'error');
    tasks = [];
  }
}

async function handleExport() {
  try {
    const response = await fetch(`${API_BASE_URL}/tasks/export`);
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showNotification('Export terminé!', 'success');
    } else {
      throw new Error('Erreur lors de l\'export');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de l\'export', 'error');
  }
}

// ================================
// FILTRES ET TRI
// ================================

function handleFilterChange(filter) {
  currentFilter = filter;
  elements.filterBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  updateUI();
}

function handleSortChange(sort) {
  currentSort = sort;
  updateUI();
}

function getFilteredAndSortedTasks() {
  let filteredTasks = [...tasks];

  // Filtrage
  switch (currentFilter) {
    case 'todo':
      filteredTasks = filteredTasks.filter(task => task.status === 'todo');
      break;
    case 'in_progress':
      filteredTasks = filteredTasks.filter(task => task.status === 'in_progress');
      break;
    case 'completed':
      filteredTasks = filteredTasks.filter(task => task.status === 'completed');
      break;
  }

  // Tri
  filteredTasks.sort((a, b) => {
    switch (currentSort) {
      case 'priority':
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      case 'stress':
        return b.stressLevel - a.stressLevel;
      case 'title':
        return a.title.localeCompare(b.title);
      case 'date':
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  return filteredTasks;
}

// ================================
// INTERFACE UTILISATEUR
// ================================

function updateUI() {
  const filteredTasks = getFilteredAndSortedTasks();
  renderTasks(filteredTasks);
  updateTaskCounter();
}

function renderTasks(tasksToRender) {
  if (tasksToRender.length === 0) {
    elements.tasksList.innerHTML = '';
    elements.emptyState.style.display = 'block';
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.tasksList.innerHTML = tasksToRender.map(task => createTaskHTML(task)).join('');
  
  // Ajouter les événements aux boutons
  tasksToRender.forEach(task => {
    const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
    
    // Boutons de statut
    const startBtn = taskElement.querySelector('.start-btn');
    const completeBtn = taskElement.querySelector('.complete-btn');
    const resetBtn = taskElement.querySelector('.reset-btn');
    
    if (startBtn) {
      startBtn.addEventListener('click', () => handleChangeStatus(task.id, 'in_progress'));
    }
    
    if (completeBtn) {
      completeBtn.addEventListener('click', () => handleChangeStatus(task.id, 'completed'));
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', () => handleChangeStatus(task.id, 'todo'));
    }
    
    taskElement.querySelector('.edit-btn').addEventListener('click', () => 
      handleEditTask(task.id)
    );
    
    const rewriteBtn = taskElement.querySelector('.rewrite-btn');
    if (rewriteBtn) {
      rewriteBtn.addEventListener('click', () => handleRewriteTask(task.id));
    }
    
    taskElement.querySelector('.delete-btn').addEventListener('click', () => 
      handleDeleteTask(task.id)
    );
  });
}

function createTaskHTML(task) {
  const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : '';
  const tags = task.tags ? task.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
  const stressEmojis = ['', '😌', '😐', '😰', '🤯', '💀'];
  const priorityColors = {
    low: 'priority-low',
    medium: 'priority-medium', 
    high: 'priority-high',
    urgent: 'priority-urgent'
  };

  // Statut et icônes
  const statusInfo = {
    'todo': { icon: '📝', label: 'À faire', class: 'todo' },
    'in_progress': { icon: '⚡', label: 'En cours', class: 'in-progress' },
    'completed': { icon: '✅', label: 'Terminée', class: 'completed' }
  };

  const currentStatus = task.status || (task.completed ? 'completed' : 'todo');
  const status = statusInfo[currentStatus];

  // Boutons d'action selon le statut
  let actionButtons = '';
  
  switch (currentStatus) {
    case 'todo':
      actionButtons = `
        <button class="start-btn">
          <i class="fas fa-play"></i> Commencer
        </button>
        <button class="complete-btn">
          <i class="fas fa-check"></i> Terminer
        </button>`;
      break;
    case 'in_progress':
      actionButtons = `
        <button class="complete-btn">
          <i class="fas fa-check"></i> Terminer
        </button>
        <button class="reset-btn btn-secondary">
          <i class="fas fa-undo"></i> Remettre à faire
        </button>`;
      break;
    case 'completed':
      actionButtons = `
        <button class="reset-btn btn-secondary">
          <i class="fas fa-undo"></i> Reprendre
        </button>`;
      break;
  }

  return `
    <div class="task-item ${status.class} ${priorityColors[task.priority]}" data-task-id="${task.id}">
      <div class="task-header">
        <div>
          <div class="task-title ${status.class === 'completed' ? 'completed' : ''}">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            <span>${status.icon} ${status.label}</span>
            <span>📅 ${new Date(task.createdAt).toLocaleDateString('fr-FR')}</span>
            ${dueDate ? `<span>⏰ Échéance: ${dueDate}</span>` : ''}
            <span class="stress-indicator stress-level-${task.stressLevel}">
              ${stressEmojis[task.stressLevel]} Stress: ${task.stressLevel}/5
            </span>
          </div>
        </div>
      </div>
      
      ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
      
      ${tags.length > 0 ? `
        <div class="task-tags">
          ${tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      
      ${task.aiSuggestions ? `
        <div class="ai-suggestions">
          <strong>🤖 Suggestions IA:</strong>
          ${escapeHtml(task.aiSuggestions)}
        </div>
      ` : ''}
      
      <div class="task-actions">
        ${actionButtons}
        <button class="rewrite-btn ai-btn-small">
          <i class="fas fa-pen-fancy"></i> Réécrire IA
        </button>
        <button class="edit-btn">
          <i class="fas fa-edit"></i> Modifier
        </button>
        <button class="delete-btn">
          <i class="fas fa-trash"></i> Supprimer
        </button>
      </div>
    </div>
  `;
}

function updateTaskCounter() {
  const totalTasks = tasks.length;
  const todoTasks = tasks.filter(task => task.status === 'todo').length;
  const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length;
  const completedTasks = tasks.filter(task => task.status === 'completed' || task.completed).length;
  
  elements.taskCounter.textContent = `${totalTasks} tâche${totalTasks > 1 ? 's' : ''} • ${todoTasks} à faire • ${inProgressTasks} en cours • ${completedTasks} terminée${completedTasks > 1 ? 's' : ''}`;
}

// ================================
// UTILITAIRES
// ================================

function clearForm() {
  elements.taskTitle.value = '';
  elements.taskDescription.value = '';
  elements.taskPriority.value = 'medium';
  elements.taskDueDate.value = '';
  elements.taskTags.value = '';
  elements.taskTitle.focus();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };
  
  notification.innerHTML = `
    <i class="fas ${icons[type]}"></i>
    <span>${message}</span>
  `;
  
  elements.notifications.appendChild(notification);
  
  // Auto-suppression après 4 secondes
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}