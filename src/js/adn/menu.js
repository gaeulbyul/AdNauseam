/* global vAPI, uDom, $ */
/******************************************************************************/

(function () {

  'use strict';

  var messenger = vAPI.messaging.channel('adnauseam'),
    ubmessenger = vAPI.messaging.channel('popup.js'),
    pageUrl; // the page the menu was opened on ?

  messenger.addListener(function (request) {

    //console.log("menu.Message:", request.what, request);

    switch (request.what) {

    case 'adAttempt':
      setAttempting(request.ad);
      break;

    case 'adDetected':
      renderPage(request);  // for now, just re-render everything
      break;

    case 'adVisited':
      updateAdClass(request.ad);
      break;
    }
  });

  /******************************************************************************/

  var renderPage = function (json) {

    pageUrl = json.pageUrl;

    var ads = json.onPage;

    console.log('renderPage() :: ', ads.length, json.current);

    setCounts(json.data, json.total);

    var $items = $('#ad-list-items');
    $items.removeClass().empty();

    if (!ads) return;

    for (var i = 0, j = ads.length; i < j; i++) {
      appendAd($items, ads[i]);
    }

    setAttempting(json.current);

    //if (!json.pageCount) showRecentAds(ads, json.emptyMessage);
  };

  function appendAd($items, ad) {

      if (ad.contentType === 'img') {

        appendImageAd(ad, $items);

      } else if (ad.contentType === 'text') {

        appendTextAd(ad, $items);
      }
  }

  function setAttempting(ad) {

      //ad && console.log('setAttempting: '+ad.id);

      // one 'attempt' at a time
      $('.ad-item').removeClass('attempting');
      $('.ad-item-text').removeClass('attempting');
      ad && $('#ad' + ad.id).addClass('attempting');
  }

  function updateAdClass(ad) { // one state at a time

      var $ad = $('#ad' + ad.id), cls = visitedClass(ad);
      $ad.removeClass('attempting visited failed just-visited just-failed');
      $ad.addClass(cls).addClass('just-'+cls);

      // add just-X class to img for image-ads
      if (ad.type === 'img')
        $ad.find('img').removeClass('just-visited just-failed').addClass('just-'+cls);
  }

  function setCounts(data, total) {

    //console.log('setCounts: '+visited+"/"+found+' of '+total+' total');
    $('#vault-count').text(total);
    $('#visited-count').text(visitedCount(data));
    $('#found-count').text(data.length);
  }

  function appendImageAd(ad, $items) {

    var $a, $span, $li = $('<li/>', {

      'id': 'ad' + ad.id,
      'class': ('ad-item ' + visitedClass(ad)).trim()
    });

    $a = $('<a/>', {

      'target': 'new',
      'href': ad.targetUrl
    });

    $span = $('<span/>', {
      'class': 'thumb'
    });

    $('<img/>', {

      'src': (ad.contentData.src || ad.contentData),
      'class': 'ad-item-img',
      'onerror': "this.onerror=null; this.width=50; this.height=45; this.src='img/placeholder.svg'",

    }).appendTo($span);

    $span.appendTo($a);

    $('<span/>', {

      'class': 'title',
      'text': (ad.title ? ad.title : "#" + ad.id)

    }).appendTo($a);

    $('<cite/>', {
      'text': targetDomain(ad)
    }).appendTo($a);

    $a.appendTo($li);
    $li.appendTo($items);
  }

  function appendTextAd(ad, $items) {

    var $cite, $h3, $li = $('<li/>', {

      'id': 'ad' + ad.id,
      'class': ('ad-item-text ' + visitedClass(ad)).trim()
    });

    $('<span/>', {

      'class': 'thumb',
      'text': 'Text Ad'

    }).appendTo($li);

    $h3 = $('<h3/>');

    $('<a/>', {

      'target': 'new',
      'class': 'title',
      'href': ad.targetUrl,
      'text': ad.title

    }).appendTo($h3);

    $h3.appendTo($li);

    $cite = $('<cite/>', {
      'text': ad.contentData.site
    });

    $cite.text($cite.text() + ' (#' + ad.id + ')'); // testing-only

    $cite.appendTo($li);

    $('<div/>', {

      'class': 'ads-creative',
      'text': ad.contentData.text

    }).appendTo($li);

    $li.appendTo($items);
  }

  function visitedClass(ad) {

    return ad.visitedTs > 0 ? 'visited' :
      (ad.visitedTs < 0 ? 'failed' : '');
  }

  function visitedCount(arr) {

    return (!(arr && arr.length)) ? 0 : arr.filter(function (ad) {
      return ad.visitedTs > 0;
    }).length;
  }

  function extractDomains(fullUrl) { // used in targetDomain

    var result = [],
      matches,
      regexp = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

    while ((matches = regexp.exec(fullUrl)))
      result.push(matches[0]);

    return result;
  }

  function targetDomain(ad) {

    var result, url = ad.resolvedTargetUrl || ad.targetUrl,
      domains = extractDomains(url);

    if (domains.length)
      result = new URL(domains.pop()).hostname;
    else
      warn("[ERROR] '" + ad.targetUrl + "' url=" + url);

    if (result) result += ' (#' + ad.id + ')'; // testing-only

    return result;
  }

  var getPopupData = function (tabId) {
    var onDataReceived = function (response) {
      cachePopupData(response);
      //renderPopup();
      //renderPopupLazy(); // low priority rendering
      //hashFromPopupData(true);
      //pollForContentChange();

      //console.log("tabId: ", popupData.tabId);

      messenger.send({
        what: 'adsForMenu',
        tabId: popupData.tabId
      }, renderPage);

    };

    ubmessenger.send({
      what: 'getPopupData',
      tabId: tabId
    }, onDataReceived);
  };

  /******************************************************************************/
  var cachedPopupHash = '';
  var hostnameToSortableTokenMap = {};
  var popupData = {};
  var scopeToSrcHostnameMap = {
    '/': '*',
    '.': ''
  };
  var cachePopupData = function (data) {
    console.log("DATA", data);
    popupData = {};
    scopeToSrcHostnameMap['.'] = '';
    hostnameToSortableTokenMap = {};

    if (typeof data !== 'object') {
      return popupData;
    }
    popupData = data;
    scopeToSrcHostnameMap['.'] = popupData.pageHostname || '';
    var hostnameDict = popupData.hostnameDict;
    if (typeof hostnameDict !== 'object') {
      return popupData;
    }
    var domain, prefix;
    for (var hostname in hostnameDict) {
      if (hostnameDict.hasOwnProperty(hostname) === false) {
        continue;
      }
      domain = hostnameDict[hostname].domain;
      prefix = hostname.slice(0, 0 - domain.length);
      // Prefix with space char for 1st-party hostnames: this ensure these
      // will come first in list.
      if (domain === popupData.pageDomain) {
        domain = '\u0020';
      }
      hostnameToSortableTokenMap[hostname] = domain + prefix.split('.').reverse().join('.');
    }
    return popupData;
  };

  /******************************************************************************/

  var hashFromPopupData = function (reset) {
    // It makes no sense to offer to refresh the behind-the-scene scope
    if (popupData.pageHostname === 'behind-the-scene') {
      uDom('body').toggleClass('dirty', false);
      return;
    }

    var hasher = [];
    var rules = popupData.firewallRules;
    var rule;
    for (var key in rules) {
      if (rules.hasOwnProperty(key) === false) {
        continue;
      }
      rule = rules[key];
      if (rule !== '') {
        hasher.push(rule);
      }
    }
    hasher.sort();
    hasher.push(uDom('body').hasClass('off'));
    hasher.push(uDom.nodeFromId('no-large-media').classList.contains('on'));
    hasher.push(uDom.nodeFromId('no-cosmetic-filtering').classList.contains('on'));
    hasher.push(uDom.nodeFromId('no-remote-fonts').classList.contains('on'));

    var hash = hasher.join('');
    if (reset) {
      cachedPopupHash = hash;
    }
    uDom('body').toggleClass('dirty', hash !== cachedPopupHash);
  };

  $('#log-button').click(function () {

    window.open("./adn-log.html");
  });

  $('#vault-button').click(function () {

    window.open("./adn-vault.html");
  });

  $('#pause-button').click(function () {});

  $('#settings-open').click(function () {

    // TODO: open uBlock settings here
    //window.open("./popup.html", '_self');

    window.open("./dashboard.html#adn-settings.html");

    //$('.page').toggleClass('hide');
    //$('.settings').toggleClass('hide');
  });

  $('#settings-close').click(function () {

    $('.page').toggleClass('hide');
    $('.settings').toggleClass('hide');
  });

  var AboutURL = "https://github.com/dhowe/AdNauseam/wiki/FAQ";

  $('#about-button').click(function () {

    window.open(AboutURL);
  });

  (function () {

    var tabId = null;
    // Extract the tab id of the page this popup is for
    var matches = window.location.search.match(/[\?&]tabId=([^&]+)/);
    if (matches && matches.length === 2) {
      tabId = matches[1];
    }
    getPopupData(tabId);

    //console.log('loading menu',popupData.tabId,popupData);
  })();

  /********************************************************************/

})();