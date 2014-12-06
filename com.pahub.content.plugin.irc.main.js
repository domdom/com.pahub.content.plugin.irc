function load_plugin_irc(data, folder) {
    var irc = require(path.join(folder, 'node_modules', 'irc'));
    var color = require(path.join(folder, 'node_modules', 'randomcolor'));

    model["irc"] = new irc_view_model(irc, color);

    pahub.api.resource.loadResource(path.join(folder, "index.html"), "get", {name: "HTML: irc", mode: "async", success: function(resource) {
        pahub.api.tab.addTab("section-community", "irc", "#IRC", "", 15);
        pahub.api.tab.setTabContent("section-community", "irc", resource.data);
    }});
}

function unload_plugin_irc(data) {
    // TODO: do unload stuff
}

