/*
Job Manager API
Common Live Page JS
@author Ronan Delacroix
*/

(function($){

    $.fn.serializeObject = function()
    {
        var o = {};
        var a = this.serializeArray();
        $.each(a, function() {
            if (o[this.name] !== undefined) {
                if (!o[this.name].push) {
                    o[this.name] = [o[this.name]];
                }
                o[this.name].push(this.value || '');
            } else {
                o[this.name] = this.value || '';
            }
        });
        return o;
    };

    $(document).ready(function() {

        //common
        $('body').on('mouseenter', '.tooltip:not(.tooltipstered)', function(){
            //var sides = ['bottom', 'right', 'top', 'left'];
            //if ($(this).hasClass('tooltip-right')) { sides = ['right', 'bottom', 'top', 'left']; }
            $(this).tooltipster({trigger: 'click', side: 'bottom', delay: 0, contentAsHTML: true});
                   //.tooltipster('open');
            /*
            'fade',
            'grow',
            'swing',
            'slide',*/
        });
    });

})(jQuery);