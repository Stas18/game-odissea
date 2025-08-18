const miniQuests = require('../data/miniQuests.json');
const locales = require('../data/locales.json');

class QuestService {
  getRandomMiniQuest() {
    return miniQuests[Math.floor(Math.random() * miniQuests.length)];
  }

  getAvailableMiniQuests(completedQuests = []) {
    return miniQuests.filter(quest => 
      !completedQuests.includes(quest.task)
    );
  }
}

module.exports = QuestService;