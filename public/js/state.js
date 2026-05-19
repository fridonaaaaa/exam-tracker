var TOKEN = localStorage.getItem('exam_token');
var currentUser = null;
var trackInterval = null;
var countdownInterval = null;
var progressInterval = null;
var nextCheckIn = 0;
var checkHistory = [];
var adminUsersCache = [];
var allSlotEvents = [];

var CHECK_SEC = 60;

var CITY_LABELS = {
  'ქუთაის': 'ქუთაისი', 'ბათუმ': 'ბათუმი',
  'რუსთავ': 'რუსთავი', 'გორ': 'გორი', 'ზუგდიდ': 'ზუგდიდი',
  'ფოთ': 'ფოთი', 'თელავ': 'თელავი', 'ახალციხ': 'ახალციხე', 'ოზურგეთ': 'ოზურგეთი',
};
