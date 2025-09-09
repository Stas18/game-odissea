const questions = require('../data/questions.json');

function getPointDescription(pointId) {
  const point = questions.find(p => p.pointId === pointId);
  return point ? point.location : "Неизвестная локация";
}

function getKeyboard(points) {
  return {
    reply_markup: {
      inline_keyboard: points.map(point => [
        {
          text: `📍 Локация ${point} - ${getPointDescription(point)}`,
          callback_data: `point_${point}`
        }
      ])
    }
  };
}

function getNavigationKeyboard(pointId) {
  const point = questions.find(p => p.pointId === pointId);
  if (!point || !point.coordinates) return null;

  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🗺️ Google Maps',
            url: `https://maps.google.com/?q=${point.coordinates.lat},${point.coordinates.lng}`
          },
          {
            text: '📍 Яндекс.Карты',
            url: `https://yandex.ru/maps/?pt=${point.coordinates.lng},${point.coordinates.lat}&z=17&l=map`
          }
        ],
        [
          {
            text: '📱 2GIS',
            url: `https://2gis.ru/geo/${point.coordinates.lng},${point.coordinates.lat}`
          },
          {
            text: '📍 Telegram',
            callback_data: `show_map_${pointId}`
          }
        ]
      ]
    }
  };
}

module.exports = {
  getKeyboard,
  getPointDescription,
  getNavigationKeyboard
};