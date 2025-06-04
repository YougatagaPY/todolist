const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// Charger les variables d'environnement
require('dotenv').config();

const app = express();
const PORT = 3001;

// Configuration de la base de données SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.db',
  logging: false
});

// Modèle Task
const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('todo', 'in_progress', 'completed'),
    defaultValue: 'todo'
  },
  completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  stressLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: { min: 1, max: 5 }
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  tags: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  aiSuggestions: {
    type: DataTypes.TEXT,
    defaultValue: ''
  }
});

// ⚠️ MIDDLEWARE DOIT ÊTRE EN PREMIER !
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes API

// GET - Lister toutes les tâches
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Créer une nouvelle tâche
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, priority, dueDate, tags } = req.body;
    
    // Calcul du niveau de stress basé sur l'IA
    const stressLevel = calculateStressLevel(title, description, priority);
    const aiSuggestions = generateAISuggestions(title, description);
    
    const task = await Task.create({
      title,
      description,
      priority,
      stressLevel,
      dueDate,
      tags,
      aiSuggestions
    });
    
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT - Modifier une tâche
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const task = await Task.findByPk(id);
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }
    
    // Synchroniser completed et status
    if (updates.status) {
      updates.completed = updates.status === 'completed';
    } else if (updates.completed !== undefined) {
      updates.status = updates.completed ? 'completed' : 'todo';
    }
    
    // Recalcul du stress si nécessaire
    if (updates.title || updates.description || updates.priority) {
      updates.stressLevel = calculateStressLevel(
        updates.title || task.title,
        updates.description || task.description,
        updates.priority || task.priority
      );
    }
    
    await task.update(updates);
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Supprimer une tâche
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findByPk(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' });
    }
    
    await task.destroy();
    res.json({ message: 'Tâche supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Export JSON
app.get('/api/tasks/export', async (req, res) => {
  try {
    const tasks = await Task.findAll();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=tasks-export.json');
    res.json({
      exportDate: new Date().toISOString(),
      totalTasks: tasks.length,
      tasks: tasks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Réécriture professionnelle avec Perplexity AI
app.post('/api/ai/rewrite', async (req, res) => {
  try {
    const { text, style = 'professional' } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Texte à réécrire requis' });
    }

    const rewrittenText = await rewriteWithPerplexity(text, style);
    
    res.json({
      success: true,
      rewrittenText: rewrittenText,
      originalText: text,
      style: style,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur réécriture IA:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la réécriture IA',
      fallback: generateFallbackRewrite(req.body?.text || '', req.body?.style || 'professional')
    });
  }
});

// POST - Analyse vocale et création de tâche
app.post('/api/tasks/voice', async (req, res) => {
  try {
    const { transcript } = req.body;
    const parsedTask = parseVoiceInput(transcript);
    
    const task = await Task.create({
      ...parsedTask,
      stressLevel: calculateStressLevel(parsedTask.title, parsedTask.description, parsedTask.priority),
      aiSuggestions: generateAISuggestions(parsedTask.title, parsedTask.description)
    });
    
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fonction de réécriture avec Perplexity AI - VERSION SÉCURISÉE
async function rewriteWithPerplexity(text, style) {
    // ✅ SÉCURISÉ : Récupérer la clé depuis les variables d'environnement uniquement
    const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
    
    // ✅ SÉCURISÉ : Ne pas logger la clé, juste vérifier sa présence
    console.log('🔑 Vérification clé API Perplexity:', PERPLEXITY_API_KEY ? 'Présente' : 'Manquante');
    
    if (!PERPLEXITY_API_KEY) {
      console.warn('⚠️ Clé API Perplexity manquante, utilisation du fallback');
      return generateFallbackRewrite(text, style);
    }
  
    const prompt = createRewritePrompt(text, style);
    
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [
            {
              role: 'system',
              content: 'Tu es un expert en rédaction professionnelle. Reformule le texte selon le style demandé en gardant le sens original. Réponds uniquement avec le texte reformulé, sans explication.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        })
      });
  
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Erreur API Perplexity: ${response.status} - ${errorData}`);
      }
  
      const data = await response.json();
      return data.choices[0].message.content.trim();
      
    } catch (error) {
      console.error('Erreur Perplexity API:', error);
      return generateFallbackRewrite(text, style);
    }
  }

function createRewritePrompt(text, style) {
    const styleInstructions = {
      professional: 'Reformule ce texte de manière professionnelle et claire, adapté pour un environnement de travail.',
      correct: 'Corrige les fautes d\'orthographe, de grammaire et de conjugaison dans ce texte tout en gardant le sens original.',
      formal: 'Réécris ce texte dans un style formel et soutenu, avec un vocabulaire précis.',
      concise: 'Reformule ce texte de manière très concise et directe, en éliminant les mots superflus.',
      detailed: 'Développe et enrichis ce texte en ajoutant des détails pertinents et des précisions.',
      friendly: 'Réécris ce texte dans un ton amical et accessible, tout en restant professionnel.',
      technical: 'Reformule ce texte avec un vocabulaire technique et précis, adapté à un contexte professionnel spécialisé.'
    };
  
    const instruction = styleInstructions[style] || styleInstructions.professional;
  
    // Détecter si c'est une demande de titre+description
    if (text.includes('Titre:') && text.includes('Description:')) {
      return `${instruction}
  
  ${text}
  
  IMPORTANT: Retourne le résultat au format suivant pour une tâche:
  - Une première phrase courte et claire pour le titre (max 80 caractères)
  - Un point ou deux points
  - Puis une description plus détaillée
  
  Exemple: "Finaliser le rapport mensuel. Compiler les données de vente, analyser les tendances et préparer la présentation pour la direction."
  
  Ne mets pas de guillemets autour de ta réponse.`;
    }
  
    // Pour les autres cas (titre seul ou description seule)
    return `${instruction}
  
  Texte à réécrire :
  "${text}"
  
  Garde le même sens mais améliore la formulation. Retourne uniquement le texte réécrit, sans commentaires ni guillemets.`;
  }

function generateFallbackRewrite(text, style) {
  // Réécriture de secours si Mistral n'est pas disponible
  const improvements = {
    professional: {
      replacements: [
        ['faire', 'réaliser'],
        ['voir', 'examiner'],
        ['finir', 'finaliser'],
        ['commencer', 'initier'],
        ['changer', 'modifier']
      ],
      prefix: 'Objectif : '
    },
    correct: {
      replacements: [
        ['ca', 'cela'],
        ['pk', 'pourquoi'],
        ['tjrs', 'toujours'],
        ['vs', 'vous'],
        ['dc', 'donc']
      ],
      prefix: ''
    },
    formal: {
      replacements: [
        ['ok', 'validé'],
        ['super', 'excellent'],
        ['problème', 'problématique']
      ],
      prefix: 'Il convient de : '
    },
    concise: {
      replacements: [
        ['il faut que je', 'je dois'],
        ['il est nécessaire de', ''],
        ['afin de', 'pour']
      ],
      prefix: ''
    },
    technical: {
      replacements: [
        ['faire', 'implémenter'],
        ['vérifier', 'valider'],
        ['problème', 'dysfonctionnement']
      ],
      prefix: 'Procédure : '
    }
  };

  let rewritten = text || 'Texte non fourni';
  const config = improvements[style] || improvements.professional;
  
  // Appliquer les remplacements
  config.replacements.forEach(([from, to]) => {
    const regex = new RegExp(from, 'gi');
    rewritten = rewritten.replace(regex, to);
  });
  
  // Ajouter un préfixe si nécessaire
  if (config.prefix && !rewritten.toLowerCase().startsWith(config.prefix.toLowerCase())) {
    rewritten = config.prefix + rewritten;
  }
  
  return rewritten + '\n\n[Réécriture basique - Mistral indisponible]';
}

// IA - Fonctions d'assistance intelligente
function calculateStressLevel(title, description, priority) {
  let stress = 1;
  
  // Mots-clés de stress
  const stressKeywords = ['urgent', 'deadline', 'important', 'critique', 'rush', 'asap'];
  const relaxKeywords = ['simple', 'facile', 'rapide', 'routine'];
  
  const text = (title + ' ' + description).toLowerCase();
  
  stressKeywords.forEach(keyword => {
    if (text.includes(keyword)) stress += 1;
  });
  
  relaxKeywords.forEach(keyword => {
    if (text.includes(keyword)) stress -= 0.5;
  });
  
  // Ajustement selon la priorité
  const priorityStress = {
    'low': 0,
    'medium': 1,
    'high': 2,
    'urgent': 3
  };
  
  stress += priorityStress[priority] || 1;
  
  return Math.max(1, Math.min(5, Math.round(stress)));
}

function generateAISuggestions(title, description) {
  const suggestions = [];
  const text = (title + ' ' + description).toLowerCase();
  
  // Suggestions de découpage
  if (text.includes('projet') || text.includes('développer') || text.includes('créer')) {
    suggestions.push('💡 Divisez ce projet en sous-tâches plus petites');
    suggestions.push('📋 Créez un planning avec des étapes intermédiaires');
  }
  
  if (text.includes('réunion') || text.includes('meeting')) {
    suggestions.push('📅 Préparez un agenda avant la réunion');
    suggestions.push('📝 Notez les points clés à aborder');
  }
  
  if (text.includes('urgent') || text.includes('deadline')) {
    suggestions.push('⏰ Focalisez-vous sur cette tâche en priorité');
    suggestions.push('🚫 Éliminez les distractions pendant le travail');
  }
  
  return suggestions.join(' | ');
}

function parseVoiceInput(transcript) {
  const text = transcript.toLowerCase();
  
  // Extraction de la priorité
  let priority = 'medium';
  if (text.includes('urgent') || text.includes('important')) priority = 'urgent';
  else if (text.includes('haute priorité') || text.includes('high')) priority = 'high';
  else if (text.includes('basse priorité') || text.includes('low')) priority = 'low';
  
  // Nettoyage du titre
  let title = transcript
    .replace(/urgent|important|haute priorité|basse priorité|high|low/gi, '')
    .trim();
  
  if (title.length > 100) {
    return {
      title: title.substring(0, 100) + '...',
      description: title,
      priority
    };
  }
  
  return {
    title: title || 'Tâche vocale',
    description: `Créée par commande vocale: "${transcript}"`,
    priority
  };
}

// Route pour servir le frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Initialisation de la base de données et démarrage du serveur
sequelize.sync({ force: false }).then(() => {
  console.log('🗄️  Base de données synchronisée');
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Erreur de connexion à la base de données:', err);
});