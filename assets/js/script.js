
/*!--------------------------------*\
   3-Jekyll Theme
   @author Peiwen Lu (P233)
   https://github.com/P233/3-Jekyll
\*---------------------------------*/

// Variables
var sidebar    = $('#sidebar'),
    container  = $('#post'),
    content    = $('#pjax'),
    button     = $('#icon-arrow');
    scrollTop  = $('#icon-arrow-up');

// Detect window size, if less than 1280px add class 'mobile' to sidebar therefore it will be auto hide when trigger the pjax request in small screen devices.
if ($(window).width() < 1280) {
  sidebar.addClass('mobile');
}

// Tags switcher
$('#tags__ul li').on('click', function() {
  $(this).addClass('active').siblings().removeClass('active');
  postFilter.tag = $(this).data('tag');
  applyPostFilter();
});

// If sidebar has class 'mobile', hide it after clicking.
$('.pl__all').on('click', function() {
  $(this).addClass('active').siblings().removeClass('active');
  if (sidebar.hasClass('mobile')) {
    $('#sidebar, #pjax, #icon-arrow').addClass('fullscreen');
  }
});

// Enable fullscreen.
$('#js-fullscreen').on('click', function() {
  if (button.hasClass('fullscreen')) {
    sidebar.removeClass('fullscreen');
    button.removeClass('fullscreen');
    content.delay(300).queue(function(){
      $(this).removeClass('fullscreen').dequeue();
    });
  } else {
    sidebar.addClass('fullscreen');
    button.addClass('fullscreen');
    content.delay(200).queue(function(){
      $(this).addClass('fullscreen').dequeue();
    });
  }
});

$('#scroll-top').on('click', function() {
  container.animate({
    scrollTop: 0
  }, 200);
});

// Mobile top bar menu button toggles the posts list
$('#mobile-bar__menu').on('click', function() {
  $('#js-fullscreen').trigger('click');
});

// Show the scroll-to-top button only after scrolling down
container.on('scroll', function() {
  $('#scroll-top').toggleClass('is-visible', container.scrollTop() > 400);
});

$('#mobile-avatar').on('click', function(){
  $('#sidebar, #pjax, #icon-arrow').addClass('fullscreen');
});

// Build mailto links on click so the address is not in the HTML for scrapers
$(document).on('click', '.js-email', function(e) {
  var address = $(this).data('user') + '@' + $(this).data('domain');
  if ($(this).attr('href') === '#') {
    e.preventDefault();
    $(this).attr('href', 'mailto:' + address);
    if (!$(this).hasClass('fontello')) {
      $(this).text(address);
    }
    window.location.href = 'mailto:' + address;
  }
});

// Pjax
$(document).pjax('#avatar, #mobile-avatar, .pl__all, .js-pjax', '#pjax', { fragment: '#pjax', timeout: 10000 });
$(document).on({
  'pjax:click': function() {
    content.removeClass('fadeIn').addClass('fadeOut');
    NProgress.start();
  },
  'pjax:start': function() {
    content.css({'opacity':0});
  },
  'pjax:end': function() {
    NProgress.done();
    container.scrollTop(0);
    content.css({'opacity':1}).removeClass('fadeOut').addClass('fadeIn');
    afterPjax();
  }
});

// Re-run scripts for post content after pjax
function afterPjax() {
  // Open links in new tab
  $('#post__content a').not('.js-pjax').attr({target: '_blank', rel: 'noopener'});

  // Mark the current post in the sidebar
  $('.pl__all').removeClass('active').filter(function() {
    return this.pathname === location.pathname;
  }).addClass('active');

  // TOC, code blocks, image zoom, lazy Disqus (assets/js/enhance.js)
  blogEnhance();

  // Lazy Loading Disqus
  // http://jsfiddle.net/dragoncrew/SHGwe/1/
  // var ds_loaded = false,
  //     top = $('#disqus_thread').offset().top;
  // window.disqus_shortname = $('#disqus_thread').attr('name');
  // function check() {
  //   var currentScrollTop = document.documentElement.scrollTop || window.pageYOffset || document.body.scrollTop;
  //   currentScrollTop = container.scrollTop();
  //   if ( !ds_loaded && currentScrollTop + container.height() > top ) {
  //     $.ajax({
  //       type: 'GET',
  //       url: 'http://' + disqus_shortname + '.disqus.com/embed.js',
  //       dataType: 'script',
  //       cache: true
  //     });
  //     ds_loaded = true;
  //   }
  //   if (currentScrollTop > 400) {
  //     $('#scroll-top').fadeIn(200);
  //   } else {
  //     $('#scroll-top').fadeOut(200);
  //   }
  // }
  // check();
  // container.scroll(check);

  if (sidebar.hasClass('mobile')) {
    $('#sidebar, #pjax, #icon-arrow').addClass('fullscreen');
  }

}afterPjax();
