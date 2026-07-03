const fs = require('fs');
const path = require('path');

const files = [
    'backend/controllers/group.controller.js',
    'backend/services/group.service.js',
    'backend/server.js'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace Project -> Group
    content = content.replace(/Project/g, 'Group');
    // Replace project -> group
    content = content.replace(/project/g, 'group');
    // Handle camelCase if needed, but project -> group is simple enough.
    
    fs.writeFileSync(file, content);
});

console.log("Replaced successfully!");
