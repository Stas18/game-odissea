const fs = require("fs");
const path = require("path");
const locales = require("../data/locales.json");
const questions = require("../data/questions.json");

class TeamService {
  constructor() {
    this.teams = this.loadTeams();
    this.teams.forEach(team => {
      if (!team.prizesReceived) {
        team.prizesReceived = [];
      }
    });
    this.saveTeams();
  }

  verifyCode(pointId, userInput) {
    const point = questions.find((p) => p.pointId === pointId);
    if (!point) return false;

    const normalizedInput = userInput
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const normalizedCode = point.code
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    return normalizedInput === normalizedCode;
  }

  loadTeams() {
    const filePath = path.join(__dirname, "../data/teams.json");
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) || [];
    } catch (err) {
      if (err.code === "ENOENT") {
        return [];
      }
      console.error(locales.loadTeamsError, err);
      return [];
    }
  }

  saveTeams() {
    const filePath = path.join(__dirname, "../data/teams.json");
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
      completionTime: null,
      waitingForMembers: false,
      waitingForBroadcast: false,
      lastAnswerTime: null,
      questionPoints: {}
    };

    this.teams.push(newTeam);
    this.saveTeams();
    return newTeam;
  }

  isTeamRegistered(chatId) {
    return this.teams.some((team) => team.chatId === chatId);
  }

  getTeam(chatId) {
    return this.teams.find((team) => team.chatId === chatId);
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

  getGameTime(chatId) {
    const team = this.getTeam(chatId);
    if (!team) return locales.zeroTime;

    const start = new Date(team.startTime);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    return hours > 0
      ? `${hours}${locales.hours} ${mins}${locales.minutes}`
      : `${mins}${locales.minutes}`;
  }

  setCompletionTime(chatId) {
    const team = this.getTeam(chatId);
    if (team) {
      team.completionTime = new Date().toISOString();
      this.saveTeams();
      return true;
    }
    return false;
  }

  getTeamProgress(chatId) {
    const team = this.getTeam(chatId);
    if (!team) return null;

    const questions = require("../data/questions.json");
    const miniQuests = require("../data/miniQuests.json");

    return {
      teamName: team.teamName,
      captainId: team.captainId,
      members: team.members,
      points: team.points,
      completedPoints: team.completedPoints,
      totalPoints: [...new Set(questions.map((q) => q.pointId))].length,
      completedMiniQuests: team.completedMiniQuests,
      totalMiniQuests: miniQuests.length,
      startTime: team.startTime,
      completionTime: team.completionTime,
      timeInGame: this.getGameTime(chatId),
    };
  }

  isTeamNameAvailable(teamName) {
    return !this.teams.some((team) => team.teamName === teamName);
  }

  verifyAnswer(pointId, questionIndex, answer) {
    const questions = require("../data/questions.json");
    const point = questions.find((p) => p.pointId === pointId);

    if (!point || !point.questions[questionIndex]) return false;

    const question = point.questions[questionIndex];

    // Если это карточки (массив options)
    if (Array.isArray(question.options)) {
      const answerIndex = parseInt(answer);
      return !isNaN(answerIndex) && answerIndex === question.answer;
    }

    // Если это текстовый ответ (строка options)
    return answer.trim().toLowerCase() === question.options.toLowerCase();
  }

  updateQuestionPoints(chatId, pointId, questionIndex, pointsDelta) {
    const team = this.getTeam(chatId);
    if (team) {
      if (!team.questionPoints) team.questionPoints = {};
      const key = `${pointId}_${questionIndex}`;

      // Используем константу вместо PENALTIES
      const BASE_POINTS = 10;
      const newPoints = Math.max(1, (team.questionPoints[key] || BASE_POINTS) + pointsDelta);
      team.questionPoints[key] = newPoints;

      this.saveTeams();
    }
  }

  updateLastAnswerTime(chatId, time) {
    const team = this.getTeam(chatId);
    if (team) {
      team.lastAnswerTime = time;
      this.saveTeams();
      return true;
    }
    return false;
  }

  addPrize(chatId, prizeThreshold) {
    const team = this.getTeam(chatId);
    if (team && !team.prizesReceived.includes(prizeThreshold)) {
      team.prizesReceived.push(prizeThreshold);
      this.saveTeams();
      return true;
    }
    return false;
  }

  hasPrize(chatId, prizeThreshold = null) {
    const team = this.getTeam(chatId);
    if (!team || !team.prizesReceived) return false;

    if (prizeThreshold) {
      return team.prizesReceived.includes(prizeThreshold);
    }
    return team.prizesReceived.length > 0;
  }

  getAllCompletedTeams() {
    return this.teams.filter(team =>
      team.completedPoints && team.completedPoints.length > 0
    );
  }

  getIncompleteTeams() {
    const questions = require("../data/questions.json");
    const totalPoints = [...new Set(questions.map(q => q.pointId))].length;

    return this.teams.filter(team =>
      !team.completedPoints || team.completedPoints.length < totalPoints
    );
  }

  isPrizeAvailable(prizeThreshold) {
  const prizesPath = path.join(__dirname, "../data/prizes.json");
  try {
    if (fs.existsSync(prizesPath)) {
      const prizesData = fs.readFileSync(prizesPath, 'utf8');
      const prizes = JSON.parse(prizesData);
      return !prizes[prizeThreshold]; // Приз доступен, если его нет в глобальном файле
    }
    return true; // Файла нет - все призы доступны
  } catch (err) {
    console.error('Ошибка чтения глобальных призов:', err);
    return false;
  }
}
}

module.exports = TeamService;
