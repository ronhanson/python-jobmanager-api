/*
Job Manager API
Logs Live Page JS
@author Ronan Delacroix
*/

(function($){
    timer = null;
    job_template_compiled = null;
    hosts = {};

    function get_host_data() {

        $.getJSON('/host/', {alive:240}, get_host_data_callback);
    }

    function get_host_data_callback(data) {
        try {
            process_host_data(data);
        } catch(e) {
            console.log('Error while processing host data.');
            console.log(e);
        }
        clearTimeout(timer);
        timer = setTimeout(get_host_data, 2000);
    }

    function process_host_data(data) {

        $("#commands").removeClass('loading');
        if (data.length==0) {
            return;
        }

        clean_host_list(data);
        sort_host_list(data);

        $.each(data.reverse(), function process_base_host_data(i, base_host_data) {
            if ($("#"+base_host_data.hostname.replace(' ', '-').replace('.', '-')).length==0) {
                var compiled = _.template($('#host_template').html());
                $("#container").prepend(compiled({host: base_host_data}));
            }
            if (!hosts[base_host_data.hostname]) {
                hosts[base_host_data.hostname] = {
                    last_update: null,
                    cpu: {},
                    ram: {},
                    disk: {},
                    slot: {},
                };
            }
            host = $("#"+base_host_data.hostname.replace(' ', '-').replace('.', '-'));


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
            if (hosts[base_host_data.hostname].last_update) {
                params.limit = 5; //retrieve small amount only
            }

            if (host.hasClass('dead')) {
                // :'-(
                return;
            }
            $.getJSON('/host/'+base_host_data.hostname, params, function(host_data) {

                host = $("#"+host_data.hostname.replace(' ', '-').replace('.', '-'));
                host.removeClass('loading');

                update_host_data(host, host_data);

                current_status = host_data.history[0];
                if (current_status) {
                    update_current_status_data(host, host_data, current_status);
                }

                update_meters(host_data);

                $.getJSON('/host/stats/'+host_data.hostname, {}, update_host_stats_data);
            });


        });
    }


    function clean_host_list(host_data) {
        var alive_host_hostnames = _.pluck(host_data, 'hostname');
        var dom_host_hostnames = _.pluck($('.host'), 'id');
        _.each(_.difference(alive_host_hostnames, dom_host_hostnames), function(id) {
            $("#"+id).removeClass('alive dead').addClass('dead');
        });
    }


    function sort_host_list(host_data) {
        var container = $("#container");

        var dom_host_hostnames = _.pluck($('.host'), 'id');
        var new_order = container.find('.host').sort(function(a, b) {     // first sort by created date
            _a =  _.findWhere(host_data, {'hostname': a.id});
            _b = _.findWhere(host_data, {'hostname': b.id})
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

        var new_order_hostnames = _.pluck(new_order, 'id');
        if (!_.isEqual(new_order_hostnames, dom_host_hostnames)) {
            new_order.appendTo(container); // do DOM sort only if needed
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


    function update_host_data(host_dom, host_data) {
        var _since = moment.utc(host_data.created);
        var _last_alive = moment.utc(host_data.last_seen_alive);
        var _now = null;
        hosts[host_data.hostname].last_update = _since;
        var host_status = null;
        if (host_data.alive==true) {
            host_status = 'alive';
            _now = _last_alive; // if host is alive, we take his own "now" datetime as a reference
        }
        else {
            host_status = 'dead';
            _now = moment.utc();
        }

        host_running = host_dom.removeClass('alive dead').addClass(host_status);
        host_running_pid = host_dom.find('.pid .value').html(host_data.pid);
        host_running_since = host_dom.find('.dates .since').html(_since.from(_now));
        host_running_for = host_dom.find('.dates .for').html(_last_alive.diff(_since, 'hours', true).toFixed(1)+' hours');
        host_running_pool_size = host_dom.find('.slots.total').html(host_data.pool_size);
        if (host_dom.find('.job_types ul').children().length==0) {
            host_running_job_types = '';
            $.each(host_data.job_types, function(k, jt) {
                host_running_job_types = host_running_job_types + '<li class="tag job_type">'+jt+'</li>';
            });
            host_dom.find('.job_types ul').html(host_running_job_types);
        }

        if (host_data.alive==false && hosts[host_data.hostname].last_update != null) {
            host_running_since = host.find('.dates .stopped').html( 'Dead since '+_last_alive.fromNow()+'.');
            hosts[host_data.hostname].last_update = _since;
            return;
        }
    }

    function update_current_status_data(host_dom, host_data, current_status_data) {
        busy_slots = current_status_data.current_jobs.length;
        host.find('.slots .busy').html(busy_slots);

        if (host_data.alive==false) {
            host.find('.general .status').removeClass('play pause').addClass('stop')
            host.find('.general .status i').removeClass('fa-refresh fa-spin fa-pause').addClass('fa-stop');
        }
        else if (busy_slots>0) {
            host.find('.general .status').removeClass('pause').addClass('play')
            host.find('.general .status i').removeClass('fa-pause').addClass('fa-refresh fa-spin');
        } else {
            host.find('.general .status').removeClass('play').addClass('pause');
            host.find('.general .status i').removeClass('fa-refresh fa-spin').addClass('fa-pause');
        }

        cpu_percent  = current_status_data.system_status.cpu.percent;
        ram_percent  = current_status_data.system_status.memory.virtual.percent;
        disk_percent = current_status_data.system_status.disk[0].percent;
        slot_percent = current_status_data.current_jobs.length/host_data.pool_size*100;

        gauge(host.find('.cpu  .gauge'), cpu_percent);
        gauge(host.find('.ram  .gauge'), ram_percent);
        gauge(host.find('.disk .gauge'), disk_percent);
        gauge(host.find('.slot .gauge'), slot_percent, current_status_data.current_jobs.length);

        $.each(['cpu', 'ram', 'disk', 'slot'], function process_status_plot_data(k, kind) {
            host_meter = host.find('.'+kind);

            if (host_meter.find('.chart canvas').data('setup') !== "ok") {
                setup_meter(kind, host_meter, host_data);
            }

        });

    }

    function setup_meter(kind, host_meter, host_data) {
        var minutes = 30;
        var millisPerPixel = (minutes*60)/180*1000;
        console.log('Setting up '+kind+' meter for '+host_data.hostname+' ...');
        //$('#'+host_data.hostname+' .'+kind+' .chart-selector').append('<span class="char-time" data-time="10080">7d</a>');
        host_meter.find('.chart-selector .char-time').on( 'click', function () {
                $(this).parent().find('.char-time').removeClass('selected');
                $(this).addClass('selected');
                hosts[host_data.hostname].last_update = null;
                hosts[host_data.hostname][kind].series.data = [];
                host_meter.find('.chart canvas').data('time', $(this).data('time'));
                minutes = host_meter.find('.chart canvas').data('time');
                millisPerPixel = (minutes*60)/180*1000;
                //hosts[host_data.hostname].last_update
                hosts[host_data.hostname][kind].chart.options.millisPerPixel = millisPerPixel;
                hosts[host_data.hostname][kind].chart.options.grid.millisPerLine = millisPerPixel*60;
        });

        var chart_range = null;
        if (kind=='slot') {
            chart_range = function (range) { return {min: 0.0, max: host_data.pool_size}; }
        } else {
            chart_range = function (range) { return {min: 0.0, max: 100.0}; }
        }

        hosts[host_data.hostname][kind].chart = new SmoothieChart(
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

        var canvas = host_meter.find('.chart canvas')[0];

        hosts[host_data.hostname][kind].series = new TimeSeries();

        /*
        setInterval(function() {
          series.append(new Date().getTime(), Math.random());
        }, 1000);

        series[host_data.hostname].append(moment.utc(current_status.created), cpu_percent);*/

        hosts[host_data.hostname][kind].chart.addTimeSeries(hosts[host_data.hostname][kind].series, {
            lineWidth: 1.1,
            strokeStyle: '#00ff00',
            fillStyle: 'rgba(52,234,28,0.32)'
        });
        hosts[host_data.hostname][kind].chart.streamTo(canvas, 500);

        host_meter.find('.chart canvas').data('setup', 'ok');
        console.log('Meter '+kind+' setup done for '+host_data.hostname+' .');
    }

    function update_meters(host_data) {
        $.each(host_data.history.reverse(), function(i, status) {
            var status_time = moment.utc(status.created);
            if (!hosts[host_data.hostname].last_update || status_time > hosts[host_data.hostname].last_update) {
                hosts[host_data.hostname].last_update = status_time;
                hosts[host_data.hostname].cpu.series.append(moment.utc(status.created), status.system_status.cpu.percent);
                hosts[host_data.hostname].ram.series.append(moment.utc(status.created), status.system_status.memory.virtual.percent);
                hosts[host_data.hostname].disk.series.append(moment.utc(status.created), status.system_status.disk[0].percent);
                hosts[host_data.hostname].slot.series.append(moment.utc(status.created), status.current_jobs.length);
            }
        });
    }

    function process_jobs(host, jobs) {
        console.log('Processing jobs for host '+host.attr('id'));

        if (!host.hasClass('job_processing')) {
            try {
                host.addClass('job_processing');
                _.each(jobs, function process_job(job) {
                    if (host.find('.jobs .'+job.status+' .list').find("#"+job.uuid).length==0) {
                        if (host.find('.jobs .running .list').find("#"+job.uuid).length==1) {

                            var $old = host.find('.jobs .running .list').find("#"+job.uuid);
                            //First we copy the arrow to the new table cell and get the offset to the document
                            var $new = $old.clone().prependTo(host.find('.jobs .'+job.status+' .list'));
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

                            host.find('.jobs .'+job.status+' .list').animate({'left': '185px'}, 'slow', function(){
                                host.find('.jobs .'+job.status+' .list').css('left', '65px');
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
                            host.find('.jobs .'+job.status+' .list').css('left', '-55px');
                            host.find('.jobs .'+job.status+' .list').prepend(new_job);
                            console.log('Added job '+job.uuid);
                            new_job.find(".created").html(moment.utc(job.created).fromNow());
                            new_job.animate({'opacity': 1.0}, 'slow');
                            host.find('.jobs .'+job.status+' .list').animate({'left': '65px'}, 'slow');
                        }
                    }
                    if (job.status=='running') {
                        $(".job#"+job.uuid+" .completion").css('width', job.completion+'%');
                    }
                    $(".job#"+job.uuid).find(".created").html(moment.utc(job.created).fromNow());

                });
                host.removeClass('job_processing');
            }
            catch (e) {
                host.removeClass('job_processing');
                throw e;
            }
            console.log('Processing jobs of host '+host.attr('id') +' complete.');
        }
        else {
            console.log('Bypassing jobs processing for '+host.attr('id') +'.');
        }
    }

    function update_host_stats_data(host_stats_data) {
        var host = $("#"+host_stats_data.hostname.replace(' ', '-').replace('.', '-'));
        host.find('.jobs .stat .value').html('0');
        _.each(['running', 'success', 'error'], function(status_key) {
            var status_stats = _.findWhere(host_stats_data.statuses, {status: status_key});
            if (status_stats) {
                host.find('.jobs .'+status_stats.status+' .stat .value').html(status_stats.count);
                host.find('.jobs .'+status_stats.status+' .stat').attr('title', 'Last occured '+moment.utc(status_stats.last).fromNow());
            }
        });

        process_jobs(host, host_stats_data.jobs.reverse());
    }

    function log_button_click_callback() {
        var that = this;
        $.magnificPopup.open({
            items: {
                src: '',
            },
            callbacks: {
                elementParse: function(item) {
                  item.src = '/logs/live?ajax=true&' + $.param($(that).data());
                  item.data.src = '/logs/live?ajax=true&' + $.param($(that).data());
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
                  item.src = '/job/live/' + $(that).html() + "?ajax=true";
                  item.data.src = '/job/live/' + $(that).html() + "?ajax=true";
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
			$.each(hosts, function(id, c) {
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

        get_host_data();

    });
})(jQuery);