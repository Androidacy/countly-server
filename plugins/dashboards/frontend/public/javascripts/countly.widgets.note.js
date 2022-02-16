/*global countlyVue, CV, countlyCommon */

(function() {
    var WidgetComponent = countlyVue.views.create({
        template: CV.T('/dashboards/templates/widgets/note/widget.html'),
        props: {
            data: {
                type: Object,
                default: function() {
                    return {};
                }
            }
        },
        computed: {
            widgetStyling: function() {
                var widgetData = this.data;
                var style = "", fontSize, lineHeight;
                if (widgetData.font_size && !Number.isNaN(parseFloat(widgetData.font_size))) {
                    fontSize = parseFloat(widgetData.font_size);
                    lineHeight = fontSize + 7;
                }
                else {
                    fontSize = 15;
                    lineHeight = 22;
                }

                style += 'font-size: ' + fontSize + 'px;';
                style += 'line-height: ' + lineHeight + 'px;';

                if (widgetData.bar_color) {
                    style += 'color: ' + countlyCommon.GRAPH_COLORS[this.data.bar_color - 1] + ';';
                }

                if (widgetData.text_decoration) {
                    for (var i = 0 ; i < widgetData.text_decoration.length; i++) {
                        if (widgetData.text_decoration[i] === "b") {
                            style += 'font-weight: bold;';
                        }

                        if (widgetData.text_decoration[i] === "i") {
                            style += 'font-style: italic;';
                        }

                        if (widgetData.text_decoration[i] === "u") {
                            style += 'text-decoration: underline;';
                        }
                    }
                }

                return style;
            },
            mylink: function() {
                if (this.data.add_link) {
                    return {"link": this.data.link_path, "text": this.data.link_text};
                }
                else {
                    return false;
                }
            },
            widgetText: function() {
                return this.data.content;
            }

        },
        methods: {
            beforeCopy: function(data) {
                return data;
            }
        }
    });

    var DrawerComponent = countlyVue.views.create({
        template: CV.T('/dashboards/templates/widgets/note/drawer.html'),
        props: {
            scope: {
                type: Object,
                default: function() {
                    return {};
                }
            }
        },
        data: function() {
            return {
                constants: {
                    textDecorations: [
                        {
                            name: CV.i18nM("dashboards.bold"),
                            value: "b"
                        },
                        {
                            name: CV.i18nM("dashboards.italic"),
                            value: "i"
                        },
                        {
                            name: CV.i18nM("dashboards.underline"),
                            value: "u"
                        }
                    ]
                }
            };
        }
    });

    countlyVue.container.registerData("/custom/dashboards/widget", {
        type: "note",
        label: CV.i18nM("dashboards.widget-type.note"),
        priority: 5,
        primary: true,
        getter: function(widget) {
            return widget.widget_type === "note";
        },
        drawer: {
            component: DrawerComponent,
            getEmpty: function() {
                return {
                    widget_type: "note",
                    content: "",
                    apps: "*",
                    text_decoration: [],
                    bar_color: 1,
                    font_size: "15",
                    link_text: "",
                    link_path: "",
                    add_link: false,
                };
            },
            beforeSaveFn: function(doc) {
                if (!doc.add_link) {
                    doc.link_text = "";
                    doc.link_path = "";
                }

            }
        },
        grid: {
            component: WidgetComponent,
            dimensions: function() {
                return {
                    minWidth: 1,
                    minHeight: 3,
                    width: 1,
                    height: 3
                };
            }
        }
    });
})();