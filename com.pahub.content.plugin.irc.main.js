function load_plugin_irc(data, folder) {
    model["irc"] = new irc_view_model();

    pahub.api.resource.loadResource(path.join(folder, "index.html"), "get", {name: "HTML: irc", mode: "async", success: function(resource) {
        pahub.api.tab.addTab("section-community", "irc", "#IRC", null, 11);
        pahub.api.tab.setTabContent("section-community", "irc", resource.data);
    }});
}

function unload_plugin_irc(data) {
    // TODO: do unload stuff
}

