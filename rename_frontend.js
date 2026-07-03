const fs = require('fs');
const path = require('path');

const files = [
    'frontend/src/screens/Home.jsx',
    'frontend/src/screens/Group.jsx',
    'frontend/src/config/socket.js'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace Project -> Group
    content = content.replace(/Project/g, 'Group');
    // Replace project -> group
    content = content.replace(/project/g, 'group');
    // Replace projects -> groups
    content = content.replace(/projects/g, 'groups');
    
    fs.writeFileSync(file, content);
});

console.log("Frontend replaced successfully!");
