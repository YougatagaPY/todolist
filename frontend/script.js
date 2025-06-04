// Configuration de l'API
const API_BASE_URL = 'http://localhost:3001/api';

// État global de l'application
let tasks = [];
let currentFilter = 'all';
let currentSort = 'date';
let isRecording = false;
let recognition = null;
let editingTaskId = null;

// Variables pour la réécriture IA
let currentRewriteTaskId = null;
let currentRewrittenText = '';

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

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  setupSpeechRecognition();
});

// Initialisation
async function initializeApp() {
  showNotification('Chargement des tâches...', 'info');
  await loadTasks();
  updateUI();
}

// Configuration des événements
function setupEventListeners() {
  // Ajout de tâche
  elements.addTaskBtn.addEventListener('click', handleAddTask);
  elements.taskTitle.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  // Commande vocale
  elements.voiceBtn.addEventListener('click', toggleVoiceRecording);
  elements.stopVoiceBtn.addEventListener('click', stopVoiceRecording);
  
  // Test du microphone
  if (elements.testMicBtn) {
    elements.testMicBtn.addEventListener('click', testMicrophone);
  }

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
    }
  });
}

// Configuration de la reconnaissance vocale
function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    elements.voiceBtn.style.display = 'none';
    showNotification('La reconnaissance vocale n\'est pas supportée par votre navigateur', 'warning');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'fr-FR';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log('🎤 Reconnaissance vocale démarrée');
    isRecording = true;
    elements.voiceBtn.classList.add('recording');
    elements.voiceIndicator.classList.remove('hidden');
    showNotification('🎤 Parlez maintenant...', 'info');
  };

  recognition.onresult = (event) => {
    console.log('🎯 Résultat reçu:', event);
    const transcript = event.results[0][0].transcript;
    const confidence = event.results[0][0].confidence;
    console.log(`Texte: "${transcript}", Confiance: ${confidence}`);
    handleVoiceResult(transcript);
  };

  recognition.onerror = (event) => {
    console.error('❌ Erreur de reconnaissance vocale:', event.error);
    let errorMessage = 'Erreur de reconnaissance vocale';
    
    switch(event.error) {
      case 'not-allowed':
        errorMessage = 'Microphone non autorisé. Veuillez autoriser l\'accès au microphone.';
        break;
      case 'no-speech':
        errorMessage = 'Aucune parole détectée. Réessayez.';
        break;
      case 'network':
        errorMessage = 'Erreur réseau. Vérifiez votre connexion.';
        break;
      case 'audio-capture':
        errorMessage = 'Microphone non disponible.';
        break;
      case 'service-not-allowed':
        errorMessage = 'Service de reconnaissance non autorisé. Utilisez HTTPS ou localhost.';
        break;
    }
    
    showNotification(errorMessage, 'error');
    stopVoiceRecording();
  };

  recognition.onend = () => {
    console.log('🔚 Reconnaissance vocale terminée');
    stopVoiceRecording();
  };

  recognition.onnomatch = () => {
    console.log('❓ Aucune correspondance trouvée');
    showNotification('Texte non reconnu, veuillez répéter', 'warning');
    stopVoiceRecording();
  };
}

// Gestion de la commande vocale
function toggleVoiceRecording() {
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

function startVoiceRecording() {
  if (!recognition) {
    showNotification('Reconnaissance vocale non initialisée', 'error');
    return;
  }
  
  try {
    console.log('🚀 Tentative de démarrage de la reconnaissance...');
    recognition.start();
  } catch (error) {
    console.error('Erreur lors du démarrage:', error);
    showNotification('Impossible de démarrer la reconnaissance vocale', 'error');
  }
}

function stopVoiceRecording() {
  if (recognition && isRecording) {
    recognition.stop();
  }
  isRecording = false;
  elements.voiceBtn.classList.remove('recording');
  elements.voiceIndicator.classList.add('hidden');
}

// Test du microphone
async function testMicrophone() {
  try {
    showNotification('Test du microphone...', 'info');
    
    // Demander l'autorisation explicitement
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Fermer le stream immédiatement
    stream.getTracks().forEach(track => track.stop());
    
    showNotification('✅ Microphone autorisé ! Vous pouvez utiliser la reconnaissance vocale.', 'success');
    
    // Vérifier si la reconnaissance vocale est disponible
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      showNotification('🎤 Reconnaissance vocale prête !', 'success');
    }
    
  } catch (error) {
    console.error('Erreur test microphone:', error);
    
    let message = 'Erreur d\'accès au microphone';
    if (error.name === 'NotAllowedError') {
      message = '❌ Accès au microphone refusé. Veuillez autoriser dans les paramètres du navigateur.';
    } else if (error.name === 'NotFoundError') {
      message = '❌ Aucun microphone détecté.';
    }
    
    showNotification(message, 'error');
  }
}

async function handleVoiceResult(transcript) {
  showNotification(`Texte reconnu: "${transcript}"`, 'info');
  
  try {
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
      showNotification('Tâche créée par commande vocale!', 'success');
    } else {
      throw new Error('Erreur lors de la création de la tâche vocale');
    }
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la création de la tâche vocale', 'error');
    
    // Fallback: remplir le formulaire
    elements.taskTitle.value = transcript;
    elements.taskTitle.focus();
  }
}

// ✍️ RÉÉCRITURE IA PROFESSIONNELLE
let currentRewriteTarget = 'title'; // Par défaut, on réécrit le titre

async function handleRewriteTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  currentRewriteTaskId = taskId;
  
  // Ouvrir la modal d'abord
  elements.rewriteModal.classList.remove('hidden');
  
  // Ajouter les event listeners pour les boutons radio
  const radioButtons = document.querySelectorAll('input[name="rewriteTarget"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      currentRewriteTarget = radio.value;
      updateOriginalText(task);
    });
  });
  
  // Définir le texte original selon la sélection
  updateOriginalText(task);
  
  // Lancer la réécriture automatiquement
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
        // Si pas de description, utiliser le titre comme base
        if (!task.description || task.description.trim() === '') {
          textToRewrite = `Développer une description pour: ${task.title}`;
        }
        break;
      case 'both':
        // Pour "both", on structure le texte pour indiquer à l'IA ce qu'on veut
        if (task.description && task.description.trim()) {
          textToRewrite = `Titre: ${task.title}\n\nDescription: ${task.description}`;
        } else {
          textToRewrite = `Créer un titre professionnel et une description détaillée pour cette tâche: ${task.title}`;
        }
        break;
    }
    
    await rewriteWithMistral(textToRewrite);
  }

async function rewriteWithMistral(text, style = 'professional') {
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
      // Nettoyer le texte réécrit (enlever les guillemets et espaces inutiles)
      currentRewrittenText = result.rewrittenText
        .replace(/^["']|["']$/g, '')    // Enlever guillemets début/fin
        .replace(/^"|"$/g, '')          // Enlever doubles guillemets
        .replace(/^\s+|\s+$/g, '')      // Enlever espaces début/fin
        .trim();
        
      elements.rewrittenText.innerHTML = `
        <div style="white-space: pre-wrap;">${escapeHtml(currentRewrittenText)}</div>
      `;
      showNotification('✨ Réécriture terminée !', 'success');
    } else {
      throw new Error(result.error || 'Erreur inconnue');
    }
    
  } catch (error) {
    console.error('Erreur réécriture Mistral:', error);
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
  
  await rewriteWithMistral(textToRewrite, selectedStyle);
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
  
      // Nettoyer le texte réécrit (enlever les guillemets)
      let cleanedText = currentRewrittenText
        .replace(/^["']|["']$/g, '')  // Enlever les guillemets au début et à la fin
        .replace(/^"|"$/g, '')        // Enlever les doubles guillemets
        .trim();
  
      let updates = {};
  
      switch (selectedTarget) {
        case 'title':
          // Réécrire seulement le titre, GARDER la description originale
          updates.title = cleanedText.length > 100 ? cleanedText.substring(0, 100).trim() + '...' : cleanedText;
          updates.description = task.description || ''; // Garder la description actuelle
          break;
          
        case 'description':
          // Réécrire seulement la description, GARDER le titre original
          updates.title = task.title; // Garder le titre actuel
          updates.description = cleanedText;
          break;
          
        case 'both':
          // Réécrire titre et description - MEILLEURE LOGIQUE DE SÉPARATION
          // Chercher des séparateurs naturels
          let titlePart = '';
          let descriptionPart = '';
          
          // Méthode 1: Chercher un point suivi d'une majuscule ou retour à la ligne
          const sentenceSplit = cleanedText.match(/^([^.!?]*[.!?])\s*(.*)$/s);
          if (sentenceSplit && sentenceSplit[1].length < 120) {
            titlePart = sentenceSplit[1].replace(/[.!?]$/, '').trim();
            descriptionPart = sentenceSplit[2].trim();
          }
          // Méthode 2: Chercher un retour à la ligne
          else if (cleanedText.includes('\n')) {
            const lines = cleanedText.split('\n').filter(line => line.trim());
            titlePart = lines[0].trim();
            descriptionPart = lines.slice(1).join('\n').trim();
          }
          // Méthode 3: Chercher une virgule ou deux points après 30-80 caractères
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
              // Fallback: couper au dernier espace avant 80 caractères
              const spaceIndex = cleanedText.lastIndexOf(' ', 80);
              if (spaceIndex > 30) {
                titlePart = cleanedText.substring(0, spaceIndex).trim();
                descriptionPart = cleanedText.substring(spaceIndex).trim();
              }
            }
          }
          
          // Si aucune séparation trouvée, utiliser tout comme titre si court, sinon couper
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
  
      // Envoyer la mise à jour au serveur
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
        
        // Debug: afficher ce qui a été sauvegardé
        console.log('🔍 Mise à jour appliquée:', {
          target: selectedTarget,
          title: updates.title,
          description: updates.description
        });
        
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

// Gestion des tâches
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

// Chargement des tâches
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

// Export JSON
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

// Filtres et tri
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

// Mise à jour de l'interface
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

// Utilitaires
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