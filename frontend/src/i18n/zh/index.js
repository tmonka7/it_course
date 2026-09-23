// Simplified Chinese dictionary, split by area like ./ja. Keys are the English UI text.
import common from './common';
import layout from './layout';
import dashboard from './dashboard';
import academic from './academic';
import operations from './operations';
import security from './security';
import communication from './communication';
import admin from './admin';

export default { ...common, ...layout, ...dashboard, ...academic, ...operations, ...security, ...communication, ...admin };
