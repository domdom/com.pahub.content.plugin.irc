// view model for the irc client
function irc_view_model (irc, color) {
    // view model for the channel
    function channel_view_model(parent, channel_id, channel_name, channel_closable) {
        var self = this;

        self.id = ko.observable(channel_id); // the id of the channel
        self.name = ko.observable(channel_name); // the name of the channel
        self.messages = ko.observableArray([]); // a list of messages on this channel

        self.is_unread = ko.observable(0); // the number of unread messages
        self.is_closable = ko.observable(!channel_closable); // whether this channel tab can be closed or not
        // whether the user has scrolled to the bottom or not
        self.is_scrolled = true; // if this channel has been scrolled till the bottom
        self.is_active = false; // whether or not this channel is currently active

        // computed value for whether this channel is active
        self.is_active = ko.pureComputed(function () {
            return parent.active_channel() === self;
        });

        // sets this channel as active. sets the previous channel value
        self.select = function () {
            if (parent.active_channel() !== self) {
                self.prev_active = parent.active_channel();
            }
            parent.active_channel(self);
            self.is_unread(0);
        };

        // the number of connected users
        self.users = ko.computed(function () {
            var users = [];
            for (var i = parent.user_list().length - 1; i >= 0; i--) {
                // force dependancy on the user's nick
                parent.user_list()[i].nick();
                if (parent.user_list()[i].channels().indexOf(self.id()) !== -1) {
                    users.push(parent.user_list()[i]);
                }
            };
            
            // sort the users based on nick name and mode
            users.sort(function (a, b) {
                return (a.mode() + a.nick()).localeCompare(b.mode() + b.nick(), "en-US", {sensitivity: "base"});                
            })
            
            return users;
        });
        self.users_length = ko.computed(function () {
            return self.users().length;
        });


        // when this channel is closed
        self.on_close = function () {
            if (/^#|&/.test(self.id())) {
                parent.irc_client.part(self.id());
            }
            self.close();
        };
        
        // function for handling this tab's close
        self.close = function () {
            parent.removeChannel(self);
            if (parent.active_channel() === self) {
                parent.active_channel(self.prev_active);
                self.prev_active.select();
            }
        };

        // function to capture the scroll event
        self.on_scroll = function (data, e) {
            var el = e.target;
            self.is_scrolled = el.scrollTop === el.scrollHeight - el.clientHeight;
        };


        // add received message to one of the stores
        self.addMessageItem = function (message) {
            // add time fields
            message.time = new Date();
            message.get_time = ko.pureComputed(function () {
                return message.time.toTimeString().split(":").splice(0, 2).join(":");
            });

            // prepend an unread bar if this channel is not focused
            if (self.is_active()) {
                // this channel is focused, so remove the unread bar
                // but only if the user has scrolled all the way to the bottom
                if (self.is_scrolled) {
                    var rule = ko.utils.arrayFirst(self.messages(), function (item) {
                        return item.type === "rule";
                    });
                    if (rule) {
                        self.messages.remove(rule);
                    }
                }
            } else {
                // checking the number of unread messages
                if (self.is_unread() === 0) {
                    self.messages.push({type: "rule"});
                }
                self.is_unread(self.is_unread() + 1);
            }
            self.messages.push(message);
        };

        // removes the "unread" ruler from the messages.
        parent.active_channel.subscribe(function (new_channel) {
            if (new_channel != self) {
                var match = ko.utils.arrayFirst(self.messages(), function (item) {
                    return item.type === "rule";
                });
                if (match && self.is_scrolled) {
                    self.messages.remove(match);
                }
            }
        });
    }

    // view model for each user
    function user_view_model (parent, nick, mode) {
        var self = this;

        // the user nick name
        self.nick = ko.observable(nick);
        // mode, @ or + etc.
        self.mode = ko.observable(mode || '');

        // generate a random color here
        var random_color = color.randomColor();

        // the channels that this user is in
        self.channels = ko.observableArray([]);
        
        // do this when the name is clicked on
        self.on_click = function () {
            // check if we should pm or do a whois
        };

        // joins a channel
        self.join = function (channel_id) {
            if (typeof channel_id === typeof "") channel_id = [channel_id];
            for (var i = 0; i < channel_id.length; i++) {
                if (self.channels.indexOf(channel_id[i]) === -1) {
                    self.channels.push(channel_id[i]);
                }
            }
            self.color.notifySubscribers(self.color());
        };
        // parts a channel
        self.part = function (channel_id) {
            if (typeof channel_id === typeof "") channel_id = [channel_id];
            for (var i = 0; i < channel_id.length; i++) {
                self.channels.remove(channel_id[i]);
            }
            self.color.notifySubscribers(self.color());
        };

        // computes the color of this user
        self.color = ko.computed(function () {
            var channel = parent.active_channel();

            var color = random_color;
            // this user is not in current channel
            if (channel.users().indexOf(self) === -1) {
                color = "#777";
            } else if (channel.id() === self.nick()) {
                if (self.channels().length === 1) {
                    color = "#777";
                }
            }
            if (self.nick() === parent.nick()) {
                color = '#008cff';
            }
            return color;
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////

    // objects for the notices
    var notice_join_part = {nick: '!', color: 'cyan'};
    var notice_error = {nick: '!', color: 'red'};
    var notice_kick = {nick: '!', color: 'orange'};
    var notice_mode = {nick: '!', color: 'yellow'};
    var notice_nick = {nick: '!', color: 'green'};
    var notice_status = {nick: '!', color: 'gray'};

    var self = this;

    /////////////////////////////////////////////
    //// stored data
    /////////////////////////////////////////////
    // Array of connected channels
    self.channel_list = ko.observableArray([]);

    // Array of users
    self.user_list = ko.observableArray([]);

    // Current user info
    self.nick = ko.observable("player");
    // incase of a log in
    self.username = ko.observable('user');
    self.password = ko.observable('');


    /////////////////////////////////////////////
    //// options / settings
    /////////////////////////////////////////////
    self.options = {};
    // options for message display
    self.options.display = {};
    self.options.display.nick = ko.observable(true);
    self.options.display.join = ko.observable(true);
    self.options.display.part = ko.observable(true);
    self.options.display.kill = ko.observable(true);
    self.options.display.kick = ko.observable(true);
    self.options.display.quit = ko.observable(true);
    // option for default action on nick click
    self.options.default_actions = {}; // will use later
    // is the user going to log in?
    self.options.login_options = ko.observable(false);



    /////////////////////////////////////////////
    //// ui state variables
    /////////////////////////////////////////////
    
    // temporary state variables (the only things that depend on this are the computables)
    var show_user_list = ko.observable(false);

    // the last active channel
    self.active_channel = ko.observable({});

    // this is for the magic status channel:
    var status_channel = new channel_view_model(self, ' ', 'status', true);
    self.active_channel(status_channel);
    self.channel_list.push(status_channel);

    // whether or not we have connected already
    self.is_connected = ko.observable(false);

    // whether or not the userlist button should be shown or not
    self.show_user_list_button = ko.computed(function () {
        var ret = (/^#|&/).test(self.active_channel().id());
        return ret;
    });
    
    // whether the user list should be shown or not
    self.show_user_list = ko.computed(function () {
        var ret = self.show_user_list_button();
        ret = show_user_list() && ret;
        return ret;
    });

    /////////////////////////////////////////////
    //// event bindings
    /////////////////////////////////////////////

    // toggles user list display
    self.toggle_user_list = function () {
        show_user_list(!show_user_list());
    };
    
    // whether or not to show the login options
    self.toggle_login_options = function () {
        self.options.login_options(!self.options.login_options());
    };
    
    // connect to irc
    self.connect = function () {
        self.is_connected(true);
        initialise_irc();
    };
    // disconnect from irc and set states
    self.quit = function () {
        self.is_connected(false);
        self.irc_client.disconnect('quiting');
    };

    // event handler for keys on the input field
    self.input_keydown = function (d, e) {
        // trap the return key being pressed
        //TODO: process tab key for auto completion
        if (e.keyCode === 13) {
            var text = e.target.innerText;
            // we are dealing with a command here
            if (text[0] === '/') {
                // get the first space after the command
                var nextspace = (text.indexOf(' ') + 1 || text.length + 1) - 1;
                var command = text.slice(1,nextspace);
                var params = text.slice(nextspace+1, text.length);
                switch (command) {
                    case 'quit':
                        self.quit();
                        break;
                    case 'part':
                        if (self.active_channel().is_closable()) {
                            self.irc_client.part(self.active_channel().id(), params);
                        }
                        break;
                    case 'join':
                        self.irc_client.join(params);
                        break;
                }
                
            } else {
                // not a command, send as plain message
                self.sendMessage(text);
            }

            e.target.innerHTML = "";
            return false;
        }
        return true;
    }
    

    /////////////////////////////////////////////
    //// tasks
    /////////////////////////////////////////////
    //////// channels
    // adds a new channel
    self.addChannel = function (channel_id, channel_name, channel_closable) {
        // use custom id, or just use channel_name
        channel_name = channel_name || channel_id;
        channel_closable = channel_closable || false;
        // check if channel already exists
        var match = ko.utils.arrayFirst(self.channel_list(), function (item) {
            return item.id() === channel_id;
        });

        // if no match, create new channel datastructure
        if (!match) {
            var channel = new channel_view_model(self, channel_id, channel_name, channel_closable);
            // add it to the channel list
            self.channel_list.push(channel);
            // and then focus that channel
            self.selectChannel(channel);

            return channel;
        }
        return match;
    };
    // gets the channel for a channel id
    self.getChannel = function (channel) {
        var match = ko.utils.arrayFirst(self.channel_list(), function(item) {
            return item.id() === channel;
        });
        if (!match) {
            return self.addChannel(channel);
        }

        return match;
    };
    // remove a channel
    self.removeChannel = function (channel) {
        if (typeof channel === 'string') {
            channel = ko.utils.arrayFirst(self.channel_list(), function(item) {
                return item.id() === channel;
            });
        }
        self.channel_list.remove(channel);
    };
    // sets the active channel
    self.selectChannel = function (channel) {
        if (self.active_channel() !== channel) {
            channel.prev_active = self.active_channel();
        }
        self.active_channel(channel);
        channel.is_unread(0);
    };

    /////////////////////////////////////////////////////
    ////// users connected to this channel
    /////////////////////////////////////////////////////
    // when a user joins, add them to our list
    self.addUser = function (nick, mode) {
        // add a user to the user list
        mode = mode || '';
        var match = ko.utils.arrayFirst(self.user_list(), function (item) {
            return item.nick() === nick;
        });
        if (!match) {
            match = new user_view_model(self, nick, mode);
            self.user_list.push(match);
        }
        if (match.mode() !== mode) {
            match.mode(mode);
        }
        return match;
    };

    // remove a user
    self.removeUser = function (nick) {
        // get the user object
        if (typeof nick === 'string') nick = self.getUser(nick);
        return self.user_list.remove(nick);
    };

    // gets the user object associated with this nick
    self.getUser = function (nick) {
        var match = ko.utils.arrayFirst(self.user_list(), function (item) {
            return item.nick() === nick;
        });
        if (match) return match;

        return {
            nick : ko.observable(nick),
            mode : '',
            // other stuff...
            channels: [],
            join: function (){},
            part: function (){},
            color: '#F00'
        }
    };

    //////// Other data
    // check for input
    self.sendMessage = function (text){
        if (self.active_channel() === status_channel) return;
        
        self.irc_client.say(self.active_channel().id(), text);
        self.active_channel().addMessageItem({
            type: "message",
            from: self.getUser(self.nick()),
            text: text
        });
    };

    // convenience function
    self.addMessageItem = function (channel_id, message) {
        self.getChannel(channel_id).addMessageItem(message);
    };

    // initialise the knockout binding handlers
    function initialise_ko () {
        // handle the text of a message
        ko.bindingHandlers.parsedMessage = {
            init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                var nicks = [];

                var text = ko.unwrap(valueAccessor());

                var div = document.createElement("div");

                ko.utils.arrayForEach(self.user_list(), function (item) {
                    nicks.push("\\b" + item.nick().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\b");
                });

                // use this regex, or a regex that matches nothing
                var regex = new RegExp(nicks.join("|") || '$^', "g");
                
                // the text parts
                var text_parts = text.split(regex);
                // matched names
                var text_matches = text.match(regex);

                for (var i = 1; i < text_parts.length; i++) {
                    var t = document.createTextNode(text_parts[i - 1]);
                    element.appendChild(t);
                    var user = self.getUser(text_matches[i-1]);
                    var span = document.createElement("span");
                    element.appendChild(span);

                    ko.applyBindingsToNode(span, {
                        text: user.nick,
                        style: {color: user.color}
                    });
                }
                var t = document.createTextNode(text_parts[i - 1]);
                element.appendChild(t);
            }
        };

        // mechanism for autoscrolling
        ko.bindingHandlers.autoscroll = {
            init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                // get the scrollable element
                var el = element.parentNode.parentNode;
                // console.log(bindingContext.$parent.is_scrolled);
                // check if we need to scroll
                if (bindingContext.$parent.is_scrolled) {
                    setTimeout(function () { el.scrollTop = el.scrollHeight - el.clientHeight; }, 0);
                }
            }
        };
    }

    // initialises the irc client
    function initialise_irc () {
        //*
        // set a temp nick
        var options = {
            autoRejoin: false,
            channels: config.channels,
            realName: 'pahub_irc_' + self.nick(),
            userName: 'pahub_irc_' + self.nick()
        };
        
        if (self.options.login_options()) {
            options.userName = self.username();
            options.password = self.password();
        }

        var irc_client = new irc.Client(config.server, self.nick(), options);

        // get the user's new nick
        irc_client.on('registered', function(message) {
            self.nick(irc_client.nick);
        });

        // when a user changes nicks
        irc_client.on('nick', function (oldnick, newnick, channels, message) {
            // it's us!
            if (oldnick === self.nick()) {
                self.nick(newnick);
            }
            
            var old_user = self.getUser(oldnick);
            var new_user = self.addUser(newnick);
            
            var channels = old_user.channels().splice(0);
            
            // send nick change message to all channels which the user is connected to
            for (var i = 0; i < channels.length; i++) {
                var channel = self.getChannel(channels[i]);
                if (oldnick === self.nick()) {
                    channel.addMessageItem({
                        type: "notice",
                        text: 'You are now known as ' + newnick,
                        from: notice_nick
                    });
                } else {
                    channel.addMessageItem({
                        type: "notice",
                        text: oldnick + ' has changed their nick to ' + newnick,
                        from: notice_nick
                    });
                }
                
                // new user joins this channel, unless it's a pm channel
                if (channels[i] === oldnick) {
                    // join the pm tab
                    new_user.join(newnick);
                    // rename the pm tab
                    channel.id(newnick);
                    channel.name(newnick);
                } else {
                    // otherwise join as normal
                    new_user.join(channels[i]);
                }
                // parts the old user from all it's channels
                old_user.part(channels);
                // transfer mode as well
                new_user.mode(old_user.mode());
            }
        });

        // handles an irc message
        irc_client.on('notice', function (from, to, text, message) {
            var channel = to;
            var type = "notice";

            // check if this is a notice directed at client
            if (to === self.nick()) {
                // if so, the notice appears in the currently active channel
                channel = self.active_channel().id();
            }

            // notice for the special status tab
            // these are normally pre-join messages
            if (!from) {
                channel = status_channel.id();
                type = "status";
                from = notice_status;
            }

            // add the notice to the model
            self.addMessageItem(channel, {
                type: type,
                text: text,
                from: from
            });
        });

        // get the motd (message of the day)
        irc_client.on('motd', function(motd) {
            status_channel.addMessageItem({
                type: 'status',
                text: motd
            });
        });

        // handles an irc message to any channel
        irc_client.on('message#', function (from, to, text, message) {
            // add a message item to the right channel
            self.addMessageItem(to, {
                type: "message",
                text: text,
                from: self.getUser(from)
            });
        });
        // handles an irc message directly to me
        irc_client.on('pm', function (from, text, message) {
            self.getUser(from).join(from);
            self.getUser(self.nick()).join(from);
            
            var channel = self.addChannel(from);
            // add a message item to the right channel
            channel.addMessageItem({
                type: "message",
                text: text,
                from: self.getUser(from)
            });
        });

        // gets the list of connected users
        irc_client.on('names', function (channel, nicks) {
            Object.keys(nicks).forEach(function (key) {
                self.addUser(key, nicks[key]).join(channel);
            })
        })

        // when a user joins
        irc_client.on('join', function (channel, nick, message) {
            self.addUser(nick).join(channel);
            self.addChannel(channel);

            // check if we are the ones joining right now
            if (nick !== self.nick()) {
                self.addMessageItem(channel, {
                    type: "notice",
                    text: nick + '[' + message.user + '@' + message.host + '] has joined ' + channel,
                    from: notice_join_part
                });
            }
        });

        // when a user part's
        irc_client.on('part', function (channel, nick, reason, message) {
            reason = reason || "";
            // check if we are the ones parting right now
            if (nick === self.nick()) {
                self.getChannel(channel).close();
            } else {
                self.addMessageItem(channel, {
                    type: "notice",
                    text: nick + '[' + message.user + '@' + message.host + '] has left ' + channel + ' [' + reason + ']',
                    from: notice_join_part
                });
            }

            self.getUser(nick).part(channel);
        });

        // when a user getting kicked
        irc_client.on('kick', function (channel, nick, by, reason, message) {
            reason = reason || "";
            var text = nick + '[' + message.user + '@' + message.host + '] was kicked from ' + channel + ' by ' + by + ' [' + reason + ']';
            // check if we are the one leaving right now
            if (nick === self.nick()) {
                self.getChannel(channel).on_close();
                text = 'You were kick from ' + channel + ' by ' + by + ' [' + reason + ']';
                channel = status_channel.id();
            }
            self.addMessageItem(channel, {
                type: "notice",
                text: text,
                from: notice_kick
            });

            self.getUser(nick).part(channel);
        });
        
        // when a user getting killed
        irc_client.on('kill', function (nick, reason, channels, message) {
            reason = reason || "";
            // check if we are the ones parting right now
            if (nick === self.nick()) {
                self.quit();
            } else {
                // when a user quits
                for (var i = 0; i < channels.length; i++) {
                    self.addMessageItem(channels[i], {
                        type: "notice",
                        text: nick + '[' + message.user + '@' + message.host + '] was killed [' + reason + ']',
                        from: notice_kick
                    });
                }
            }
            self.getUser(nick).part(channels);
        });
        

        // when a user quits's
        irc_client.on('quit', function (nick, reason, channels, message) {
            reason = reason || "";
            // check if we are the ones parting right now
            if (nick === self.nick()) {
                self.quit();
            } else {
                // when a user quits
                for (var i = 0; i < channels.length; i++) {
                    self.addMessageItem(channels[i], {
                        type: "notice",
                        text: nick + '[' + message.user + '@' + message.host + '] has quit [' + reason + ']',
                        from: notice_join_part
                    });
                }
            }
            self.getUser(nick).part(channels);
        });

        irc_client.on('error', function(message){
            if (message.command === "err_nosuchchannel") {
                status_channel.addMessageItem({
                    type: "notice",
                    text: message.args[1] + ' : ' + message.args[2],
                    from: notice_error 
                });
            }
            
        });

        self.irc_client = irc_client;
    };

    ///////////////////////////////////////////////
    //// Initialise everything
    ///////////////////////////////////////////////
    // TODO: use the settings plugin to get this stuff
    // do initialisation stuff
    initialise_ko();
    // initialise_irc();
}
