// Plugin configuration, this is used in the administration when plugins are loaded
var pluginConfig = {
    name: 'RadioText Cover Art',
    version: '1.6',
    author: 'Claude',
    frontEndPath: 'radiotext-coverart/radiotext-coverart.js'
}

// Backend (server) changes can go here...
// (the actual work happens in radiotext-coverart/radiotext-coverart_server.js,
// which the webserver auto-loads because it matches the frontEndPath naming convention)

// Don't change anything below here if you are making your own plugin
module.exports = {
    pluginConfig
}
