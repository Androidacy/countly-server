var exported = {},
    countlyConfig = require("../../../frontend/express/config"),
    path = require('path'),
    fs = require('fs');

(function(plugin) {
    plugin.init = function(app) {
        const predefinedTypes = [
            "demo-banking.html",
            "demo-ecommerce.html",
            "demo-gaming.html",
            "demo-healthcare.html",
            "demo-healthcare-hospitals.html",
            "demo-navigation.html",
            "demo-navigation-map.html",
            "demo-navigation-partner.html",
        ];
        app.get(countlyConfig.path + '/populator/:id/:page', function(req, res) {
            let url = 'public/templates/demo-page.html';
            if (predefinedTypes.includes(req.params.page)) {
                url = 'public/templates/' + req.params.page;
            }
            var pageSourceCode = fs.readFileSync(path.resolve(__dirname, url));
            res.writeHead(200, { 'Content-Type': 'text/html'});
            res.end(pageSourceCode);
        });
    };
}(exported));

module.exports = exported;