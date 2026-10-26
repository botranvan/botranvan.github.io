/**
 * Sidebar filter: combines the selected tag and the search text,
 * and hides year headers that have no visible posts left.
 */
var postFilter = { tag: '', text: '' };

function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function applyPostFilter() {
  var text = normalizeText(postFilter.text);
  $('#pl__container .pl__all').each(function() {
    var matchTag = !postFilter.tag || $(this).hasClass(postFilter.tag);
    var matchText = !text || normalizeText($(this).find('.pl__title').text()).indexOf(text) !== -1;
    $(this).toggle(matchTag && matchText);
  });
  $('#pl__container .pl__year').each(function() {
    $(this).toggle($(this).nextUntil('.pl__year', '.pl__all').filter(function() {
      return $(this).css('display') !== 'none';
    }).length > 0);
  });
}

$(function() {
  $('#search-input').on('input', function() {
    postFilter.text = $(this).val();
    applyPostFilter();
  });
});
