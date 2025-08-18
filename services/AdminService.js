const fs = require('fs');
const path = require('path');
const locales = require('../data/locales.json');

class AdminService {
  constructor() {
    this.admins = JSON.parse(process.env.ADMINS || '[1147849296]');
  }

  isAdmin(userId) {
    return this.admins.includes(Number(userId));
  }

  async broadcastMessage(bot, message, teams) {
    let successCount = 0;
    for (const team of teams) {
      try {
        await bot.telegram.sendMessage(
          team.chatId, 
          `📢 ${locales.broadcastMessage.replace('%s', message)}`,
          { parse_mode: 'Markdown' }
        );
        successCount++;
      } catch (err) {
        console.error(`${locales.broadcastError.replace('%s', team.teamName)}:`, err);
      }
    }
    return successCount;
  }

  resetAllTeams(teamService) {
    const teamsWithProgress = teamService.teams.filter(
      team => team.points > 0 || 
             team.completedPoints.length > 0 || 
             team.completedMiniQuests.length > 0
    );
    const chatIds = teamsWithProgress.map(team => team.chatId);

    teamService.teams = [];
    teamService.saveTeams();

    return {
      message: locales.resetSuccess,
      affectedChatIds: chatIds
    };
  }

  getTopTeams(teams, showAll = false) {
    const questions = require('../data/questions.json');
    const miniQuests = require('../data/miniQuests.json');
    const totalPoints = [...new Set(questions.map(q => q.pointId))].length;
    const totalMiniQuests = miniQuests.length;

    const sortedTeams = [...teams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.completedPoints.length !== a.completedPoints.length) {
        return b.completedPoints.length - a.completedPoints.length;
      }
      return new Date(a.startTime) - new Date(b.startTime);
    });

    if (sortedTeams.length === 0) {
      return locales.noTeamsRegistered;
    }

    const topTeams = sortedTeams
      .filter(team => showAll || team.completedPoints.length > 0)
      .map((team, index) => {
        const timeInGame = this.formatGameTime(team.startTime);
        const progress = team.completedPoints.length >= totalPoints ? 
          locales.questCompleted : 
          `${locales.pointsProgress.replace('%d', team.completedPoints.length).replace('%d', totalPoints)}`;
        
        return `*${index + 1}. ${team.teamName}* - ${team.points} ${locales.points}\n` +
               `   ${progress} | ⏱ ${timeInGame}`;
      })
      .join('\n\n');

    return `${locales.topTeamsHeader}\n\n${topTeams || locales.noData}\n\n` +
           `${locales.totalStats.replace('%d', totalPoints).replace('%d', totalMiniQuests)}`;
  }

  formatGameTime(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    return hours > 0 ? `${hours}${locales.hours} ${mins}${locales.minutes}` : `${mins}${locales.minutes}`;
  }

  async getFullStats(teams) {
    const stats = teams.map(team => {
      const timeInGame = this.formatGameTime(team.startTime);
      return `*${team.teamName}* (ID: ${team.chatId}):\n` +
             `${locales.captain}: ${team.captainId}\n` +
             `${locales.members}: ${team.members.join(', ') || locales.none}\n` +
             `${locales.points}: ${team.points}\n` +
             `${locales.completedPoints}: ${team.completedPoints.join(', ') || locales.none}\n` +
             `${locales.completedMiniQuests}: ${team.completedMiniQuests.length}\n` +
             `${locales.timeInGame}: ${timeInGame}\n` +
             `${locales.startTime}: ${new Date(team.startTime).toLocaleString()}`;
    }).join('\n\n────────────────\n');

    return `${locales.fullStatsHeader.replace('%d', teams.length)}\n\n${stats || locales.noData}`;
  }
}

module.exports = AdminService;