const fs = require('fs');
const path = require('path');
const locales = require('../data/locales.json');

class TeamService {
  constructor() {
    this.teams = this.loadTeams();
  }

  loadTeams() {
    const filePath = path.join(__dirname, '../data/teams.json');
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) || [];
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      console.error(locales.loadTeamsError, err);
      return [];
    }
  }

  saveTeams() {
    const filePath = path.join(__dirname, '../data/teams.json');
    fs.writeFileSync(filePath, JSON.stringify(this.teams, null, 2));
  }

  registerTeam(chatId, teamName, captainId) {
    const existingTeam = this.getTeam(chatId);
    if (existingTeam) return existingTeam;

    const newTeam = {
      chatId,
      teamName,
      captainId,
      members: [],
      points: 0,
      completedPoints: [],
      completedMiniQuests: [],
      currentPoint: null,
      currentMiniQuest: null,
      currentQuestion: 0,
      totalQuestions: 0,
      startTime: new Date().toISOString(),
      waitingForMembers: true,
      waitingForBroadcast: false
    };
    
    this.teams.push(newTeam);
    this.saveTeams();
    return newTeam;
  }

  isTeamRegistered(chatId) {
    return this.teams.some(team => team.chatId === chatId);
  }

  getTeam(chatId) {
    return this.teams.find(team => team.chatId === chatId);
  }

  updateTeam(chatId, updates) {
    const team = this.getTeam(chatId);
    if (team) {
      Object.assign(team, updates);
      this.saveTeams();
      return team;
    }
    return null;
  }

  addPoints(chatId, points) {
    const team = this.getTeam(chatId);
    if (team) {
      team.points += points;
      this.saveTeams();
    }
  }

  completePoint(chatId, pointId) {
    const team = this.getTeam(chatId);
    if (team && !team.completedPoints.includes(pointId)) {
      team.completedPoints.push(pointId);
      team.currentPoint = null;
      team.currentQuestion = 0;
      team.totalQuestions = 0;
      this.saveTeams();
      return pointId;
    }
    return null;
  }

  completeMiniQuest(chatId, questTask) {
    const team = this.getTeam(chatId);
    if (team && !team.completedMiniQuests.includes(questTask)) {
      team.completedMiniQuests.push(questTask);
      team.currentMiniQuest = null;
      this.saveTeams();
      return true;
    }
    return false;
  }

  getAllTeams() {
    return this.teams;
  }

  verifyCode(pointId, code) {
    const questions = require('../data/questions.json');
    const point = questions.find(p => p.pointId === pointId);
    return point && point.code === code;
  }

  getGameTime(chatId) {
    const team = this.getTeam(chatId);
    if (!team) return locales.zeroTime;

    const start = new Date(team.startTime);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    return hours > 0 ? `${hours}${locales.hours} ${mins}${locales.minutes}` : `${mins}${locales.minutes}`;
  }

  getTeamProgress(chatId) {
    const team = this.getTeam(chatId);
    if (!team) return null;

    const questions = require('../data/questions.json');
    const miniQuests = require('../data/miniQuests.json');

    return {
      teamName: team.teamName,
      captainId: team.captainId,
      members: team.members,
      points: team.points,
      completedPoints: team.completedPoints,
      totalPoints: [...new Set(questions.map(q => q.pointId))].length,
      completedMiniQuests: team.completedMiniQuests,
      totalMiniQuests: miniQuests.length,
      startTime: team.startTime,
      timeInGame: this.getGameTime(chatId)
    };
  }
  
  isTeamNameAvailable(teamName) {
    return !this.teams.some(team => team.teamName === teamName);
  }

  updateQuestionPoints(chatId, pointId, questionIndex, points) {
  const team = this.getTeam(chatId);
  if (team) {
    if (!team.questionPoints) team.questionPoints = {};
    const key = `${pointId}_${questionIndex}`;
    team.questionPoints[key] = (team.questionPoints[key] || 10) + points;
    this.saveTeams();
  }
}
}

module.exports = TeamService;