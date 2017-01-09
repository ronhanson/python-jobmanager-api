/*
Job Manager API
Logs Live Page JS
@author Ronan Delacroix
*/

(function($){
    timer = null;
    job_template_compiled = null;
    clients = {};

    function get_client_data() {

        $.getJSON('/client/', {alive:240}, get_client_data_callback);
    }

    function get_client_data_callback(data) {
        try {
            process_client_data(data);
        } catch(e) {
            console.log('Error while processing client data.');
            console.log(e);
        }
        clearTimeout(timer);
        timer = setTimeout(get_client_data, 2000);
    }

    function process_client_data(data) {

        $("#commands").removeClass('loading');
        if (data.length==0) {
            return;
        }

        clean_client_list(data);
        sort_client_list(data);

        $.each(data.reverse(), function process_base_client_data(i, base_client_data) {
            if ($("#"+base_client_data.uuid).length==0) {
                var compiled = _.template($('#client_template').html());
                $("#container").prepend(compiled({client: base_client_data}));
            }
            if (!clients[base_client_data.uuid]) {
                clients[base_client_data.uuid] = {
                    last_update: null,
                    cpu: {},
                    ram: {},
                    disk: {},
                    slot: {},
                };
            }
            client = $("#"+base_client_data.uuid);


            var minutes = 30;
            var step = 1;
            if ($('.cpu .chart canvas').length>0) {
                minutes = $('.cpu .chart canvas').data('time');
                step = 1/(180/(minutes*60/10));
            }
            step = Math.round(step);
            if (step<1) {step = 1;}
            var millisPerPixel = (minutes*60)/180*1000;

            var params = {limit: 180, step: step};
            if (clients[base_client_data.uuid].last_update) {
                params.limit = 5; //retrieve small amount only
            }

            if (client.hasClass('dead')) {
                // :'-(
                return;
            }

            $.getJSON('/client/'+base_client_data.uuid, params, function(client_data) {

                client = $("#"+client_data.uuid);
                client.removeClass('loading');

                update_client_data(client, client_data);

                current_status = client_data.history[0];
                if (current_status) {
                    update_current_status_data(client, client_data, current_status);
                }

                update_meters(client_data);

                $.getJSON('/client/stats/'+client_data.uuid, {}, update_client_stats_data);
            });


        });
    }


    function clean_client_list(client_data) {
        var alive_client_uuids = _.pluck(client_data, 'uuid');
        var dom_client_uuids = _.pluck($('.client'), 'id');
        _.each(_.difference(alive_client_uuids, dom_client_uuids), function(id) {
            $("#"+id).removeClass('alive dead').addClass('dead');
        });
    }


    function sort_client_list(client_data) {
        var container = $("#container");

        var dom_client_uuids = _.pluck($('.client'), 'id');
        var new_order = container.find('.client').sort(function(a, b) {     // first sort by created date
            _a =  _.findWhere(client_data, {'uuid': a.id});
            _b = _.findWhere(client_data, {'uuid': b.id})
            return _b.created > _a.created;
        }).sort(function(a, b) {                                            // second sort by alive or not
            var _a = 0;                                                     // second sort by alive or not
            var _b = 0;
            if ($(a).hasClass('alive')) { _a = 1; }
            if ($(a).hasClass('dead')) { _a = -1; }
            if ($(b).hasClass('alive')) { _b = 1; }
            if ($(b).hasClass('dead')) { _b = -1; }
            return _b - _a;
        });

        var new_order_uuids = _.pluck(new_order, 'id');
        var intersect_length = _.intersection(new_order_uuids, dom_client_uuids).length;
        if (intersect_length != new_order_uuids.length || intersect_length != dom_client_uuids.length) {                          // do DOM sort only if needed
            new_order.appendTo(container);
        }


    }


    function gauge(element, data, label) {
        if (label==undefined) {label = data+'%'; }
        element.find('.percent').html(label);
        bar = element.find('.complete');
        bar.css('height', data+'%').css('top', (100-data)+'%');
        if (data>80) { bar.addClass('very-high').removeClass('high'); }
        else if (data>60) { bar.addClass('high').removeClass('very-high');}
        else { bar.removeClass('high').removeClass('very-high');}
    }


    function update_client_data(client_dom, client_data) {
        var _since = moment.utc(client_data.created);
        var _last_alive = moment.utc(client_data.last_seen_alive);
        var _now = null;
        clients[client_data.uuid].last_update = _since;
        var client_status = null;
        if (client_data.alive==true) {
            client_status = 'alive';
            _now = _last_alive; // if client is alive, we take his own "now" datetime as a reference
        }
        else {
            client_status = 'dead';
            _now = moment.utc();
        }

        client_running = client_dom.removeClass('alive dead').addClass(client_status);
        client_running_pid = client_dom.find('.pid .value').html(client_data.pid);
        client_running_since = client_dom.find('.since').html(_since.from(_now));
        client_running_for = client_dom.find('.for').html(_last_alive.diff(_since, 'hours', true).toFixed(1)+' hours');
        client_running_pool_size = client_dom.find('.slots.total').html(client_data.pool_size);
        if (client_dom.find('.job_types ul').children().length==0) {
            client_running_job_types = '';
            $.each(client_data.job_types, function(k, jt) {
                client_running_job_types = client_running_job_types + '<li class="tag job_type">'+jt+'</li>';
            });
            client_dom.find('.job_types ul').html(client_running_job_types);
        }

        if (client_data.alive==false && clients[client_data.uuid].last_update != null) {
            client_running_since = client.find('.dates .stopped').html( 'Dead since '+_last_alive.fromNow()+'.');
            clients[client_data.uuid].last_update = _since;
            return;
        }
    }

    function update_current_status_data(client_dom, client_data, current_status_data) {
        busy_slots = current_status_data.current_jobs.length;
        client.find('.slots .busy').html(busy_slots);

        if (client_data.alive==false) {
            client.find('.general .status').removeClass('play pause').addClass('stop')
            client.find('.general .status i').removeClass('fa-refresh fa-spin fa-pause').addClass('fa-stop');
        }
        else if (busy_slots>0) {
            client.find('.general .status').removeClass('pause').addClass('play')
            client.find('.general .status i').removeClass('fa-pause').addClass('fa-refresh fa-spin');
        } else {
            client.find('.general .status').removeClass('play').addClass('pause');
            client.find('.general .status i').removeClass('fa-refresh fa-spin').addClass('fa-pause');
        }

        cpu_percent = current_status_data.system_status.cpu.percent;
        ram_percent = current_status_data.system_status.memory.virtual.percent;
        disk_percent = current_status_data.system_status.disk[0].percent;
        slot_percent = current_status_data.current_jobs.length/client_data.pool_size*100;

        gauge(client.find('.cpu  .gauge'), cpu_percent);
        gauge(client.find('.ram  .gauge'), ram_percent);
        gauge(client.find('.disk .gauge'), disk_percent);
        gauge(client.find('.slot .gauge'), slot_percent, current_status_data.current_jobs.length);

        $.each(['cpu', 'ram', 'disk', 'slot'], function process_status_plot_data(k, kind) {
            client_meter = client.find('.'+kind);

            if (client_meter.find('.chart canvas').data('setup') !== "ok") {
                setup_meter(kind, client_meter, client_data);
            }

        });

    }

    function setup_meter(kind, client_meter, client_data) {
        var minutes = 30;
        var millisPerPixel = (minutes*60)/180*1000;
        console.log('Setting up '+kind+' meter for '+client_data.uuid+' ...');
        //$('#'+client_data.uuid+' .'+kind+' .chart-selector').append('<span class="char-time" data-time="10080">7d</a>');
        client_meter.find('.chart-selector .char-time').on( 'click', function () {
                $(this).parent().find('.char-time').removeClass('selected');
                $(this).addClass('selected');
                clients[client_data.uuid].last_update = null;
                clients[client_data.uuid][kind].series.data = [];
                client_meter.find('.chart canvas').data('time', $(this).data('time'));
                minutes = client_meter.find('.chart canvas').data('time');
                millisPerPixel = (minutes*60)/180*1000;
                //clients[client_data.uuid].last_update
                clients[client_data.uuid][kind].chart.options.millisPerPixel = millisPerPixel;
                clients[client_data.uuid][kind].chart.options.grid.millisPerLine = millisPerPixel*60;
        });

        var chart_range = null;
        if (kind=='slot') {
            chart_range = function (range) { return {min: 0.0, max: client_data.pool_size}; }
        } else {
            chart_range = function (range) { return {min: 0.0, max: 100.0}; }
        }

        clients[client_data.uuid][kind].chart = new SmoothieChart(
        {
            millisPerPixel: millisPerPixel,
            grid:{
                millisPerLine: 1000000,
                fillStyle:'rgba(0,0,0,0.1)',
                strokeStyle: 'rgba(255,255,255,0.1)',
                verticalSections:0
            },
            labels:{disabled:true, precision:0},
            timestampFormatter: SmoothieChart.timeFormatter,
            yRangeFunction: chart_range
        });

        var canvas = client_meter.find('.chart canvas')[0];

        clients[client_data.uuid][kind].series = new TimeSeries();

        /*
        setInterval(function() {
          series.append(new Date().getTime(), Math.random());
        }, 1000);

        series[client_data.uuid].append(moment.utc(current_status.created), cpu_percent);*/

        clients[client_data.uuid][kind].chart.addTimeSeries(clients[client_data.uuid][kind].series, {
            lineWidth: 1.1,
            strokeStyle: '#00ff00',
            fillStyle: 'rgba(52,234,28,0.32)'
        });
        clients[client_data.uuid][kind].chart.streamTo(canvas, 500);

        client_meter.find('.chart canvas').data('setup', 'ok');
        console.log('Meter '+kind+' setup done for '+client_data.uuid+' .');
    }

    function update_meters(client_data) {
        $.each(client_data.history.reverse(), function(i, status) {
            var status_time = moment.utc(status.created);
            if (!clients[client_data.uuid].last_update || status_time > clients[client_data.uuid].last_update) {
                clients[client_data.uuid].last_update = status_time;
                clients[client_data.uuid].cpu.series.append(moment.utc(status.created), status.system_status.cpu.percent);
                clients[client_data.uuid].ram.series.append(moment.utc(status.created), status.system_status.memory.virtual.percent);
                clients[client_data.uuid].disk.series.append(moment.utc(status.created), status.system_status.disk[0].percent);
                clients[client_data.uuid].slot.series.append(moment.utc(status.created), status.current_jobs.length);
            }
        });
    }

    function process_jobs(client, jobs) {
        console.log('Processing jobs for client '+client.attr('id'));

        if (!client.hasClass('job_processing')) {
            try {
                client.addClass('job_processing');
                _.each(jobs, function process_job(job) {
                    if (client.find('.jobs .'+job.status+' .list').find("#"+job.uuid).length==0) {
                        if (client.find('.jobs .running .list').find("#"+job.uuid).length==1) {

                            var $old = client.find('.jobs .running .list').find("#"+job.uuid);
                            //First we copy the arrow to the new table cell and get the offset to the document
                            var $new = $old.clone().prependTo(client.find('.jobs .'+job.status+' .list'));
                            var newOffset = $new.offset();
                            //Get the old position relative to document
                            var oldOffset = $old.offset();
                            //we also clone old to the document for the animation
                            var $temp = $old.clone().appendTo('body');
                            //hide new and old and move $temp to position
                            //also big z-index, make sure to edit this to something that works with the page
                            $temp
                              .css('position', 'absolute')
                              .css('left', oldOffset.left)
                              .css('top', oldOffset.top)
                              .css('zIndex', 1000);
                            $new.hide();
                            $old.hide();
                            //animate the $temp to the position of the new img

                            client.find('.jobs .'+job.status+' .list').animate({'left': '185px'}, 'slow', function(){
                                client.find('.jobs .'+job.status+' .list').css('left', '65px');
                            });
                            $temp.animate( {'top': newOffset.top, 'left':newOffset.left}, 'slow', function(){
                               //callback function, we remove $old and $temp and show $new
                               $new.show();
                               $old.remove();
                               $temp.remove();
                            });
                        } else {

                            console.log('Adding job '+job.uuid);
                            var new_job = $(job_template_compiled({job: job}));
                            new_job.css('opacity', 0);
                            client.find('.jobs .'+job.status+' .list').css('left', '-55px');
                            client.find('.jobs .'+job.status+' .list').prepend(new_job);
                            console.log('Added job '+job.uuid);
                            new_job.find(".created").html(moment.utc(job.created).fromNow());
                            new_job.animate({'opacity': 1.0}, 'slow');
                            client.find('.jobs .'+job.status+' .list').animate({'left': '65px'}, 'slow');
                        }
                    }
                    if (job.status=='running') {
                        $(".job#"+job.uuid+" .completion").css('width', job.completion+'%');
                    }
                    $(".job#"+job.uuid).find(".created").html(moment.utc(job.created).fromNow());

                });
                client.removeClass('job_processing');
            }
            catch (e) {
                client.removeClass('job_processing');
                throw e;
            }
            console.log('Processing jobs of client '+client.attr('id') +' complete.');
        }
        else {
            console.log('Bypassing jobs processing for '+client.attr('id') +'.');
        }
    }

    function update_client_stats_data(client_stats_data) {
        var client = $("#"+client_stats_data.client_uuid);
        client.find('.jobs .stat .value').html('0');
        _.each(['running', 'success', 'error'], function(status_key) {
            var status_stats = _.findWhere(client_stats_data.statuses, {status: status_key});
            if (status_stats) {
                client.find('.jobs .'+status_stats.status+' .stat .value').html(status_stats.count);
                client.find('.jobs .'+status_stats.status+' .stat').attr('title', 'Last occured '+moment.utc(status_stats.last).fromNow());
            }
        });

        process_jobs(client, client_stats_data.jobs.reverse());
    }

    function log_button_click_callback() {
        var that = this;
        $.magnificPopup.open({
            items: {
                src: '',
            },
            callbacks: {
                elementParse: function(item) {
                  item.src = '/logs/live?' + $.param($(that).data());
                  item.data.src = '/logs/live?' + $.param($(that).data());
                  console.log(item); // Do whatever you want with "item" object
                }
            },
            type: 'iframe',
        });
    }

    function view_job_callback() {
        var that = this;
        $.magnificPopup.open({
            items: {
                src: '',
            },
            mainClass: 'job_view',
            callbacks: {
                elementParse: function(item) {
                  item.src = '/job/live/' + $(that).html();
                  item.data.src = '/job/live/' + $(that).html();
                  console.log(item); // Do whatever you want with "item" object
                }
            },
            type: 'iframe',
        });
    }

    function commands_view_click_callback() {
        if ($('#container').hasClass('full-view')) {
            $('#container').removeClass('full-view').addClass('small-view');
            $("#commands").find('.fa').removeClass('fa-eye').addClass('fa-eye-slash');
			try { localStorage.setItem('view', 'small'); } catch(e) {}
        } else  {
            $('#container').removeClass('small-view').addClass('full-view');
            $("#commands").find('.fa').removeClass('fa-eye-slash').addClass('fa-eye');
			try { localStorage.setItem('view', 'full'); } catch(e) {}
			$.each(clients, function(id, c) {
			    c.last_update = null;
			});
        }
    }

    $(document).ready(function() {

        job_template_compiled = _.template($('#job_template').html());

        $("#commands").on('click', commands_view_click_callback);

        if (localStorage.getItem('view') == 'full') {
            $('#container').removeClass('small-view').addClass('full-view');
            $("#commands").find('.fa').removeClass('fa-eye-slash').addClass('fa-eye');
        }

        $('#container').on('click', '.logs.button', log_button_click_callback);

        $('#container').on('click', '.job .uuid', view_job_callback);

        get_client_data();

    });
})(jQuery);