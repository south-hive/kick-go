'use strict';
// Keep old root-level online invitations working after adding the game selector.
if (/^#room=[a-f0-9]{12}$/i.test(location.hash)) location.replace('alkkagi.html' + location.search + location.hash);
