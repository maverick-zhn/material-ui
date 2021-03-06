/* eslint-disable consistent-this */
// @inheritedComponent Drawer

import React from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import Drawer, { getAnchor, isHorizontal } from '../Drawer/Drawer';
import { duration } from '../styles/transitions';
import withTheme from '../styles/withTheme';
import { getTransitionProps } from '../transitions/utils';

// This value is closed to what browsers are using internally to
// trigger a native scroll.
const UNCERTAINTY_THRESHOLD = 3; // px

// We can only have one node at the time claiming ownership for handling the swipe.
// Otherwise, the UX would be confusing.
// That's why we use a singleton here.
let nodeHowClaimedTheSwipe = null;

// Exported for test purposes.
export function reset() {
  nodeHowClaimedTheSwipe = null;
}

class SwipeableDrawer extends React.Component {
  state = {
    maybeSwiping: false,
  };

  componentDidMount() {
    if (this.props.variant === 'temporary') {
      this.listenTouchStart();
    }
  }

  componentDidUpdate(prevProps) {
    const variant = this.props.variant;
    const prevVariant = prevProps.variant;

    if (variant === 'temporary' && prevVariant !== 'temporary') {
      this.listenTouchStart();
    } else if (variant !== 'temporary' && prevVariant === 'temporary') {
      this.removeTouchStart();
    }
  }

  componentWillUnmount() {
    this.removeTouchStart();
    this.removeBodyTouchListeners();
  }

  getMaxTranslate() {
    return isHorizontal(this.props) ? this.paper.clientWidth : this.paper.clientHeight;
  }

  getTranslate(current) {
    const start = isHorizontal(this.props) ? this.startX : this.startY;

    return Math.min(
      Math.max(
        this.isSwiping === 'closing' ? start - current : this.getMaxTranslate() + start - current,
        0,
      ),
      this.getMaxTranslate(),
    );
  }

  setPosition(translate, options = {}) {
    const { mode = null } = options;

    const anchor = getAnchor(this.props);
    const rtlTranslateMultiplier = ['right', 'bottom'].indexOf(anchor) !== -1 ? 1 : -1;
    const transform = isHorizontal(this.props)
      ? `translate(${rtlTranslateMultiplier * translate}px, 0)`
      : `translate(0, ${rtlTranslateMultiplier * translate}px)`;
    const drawerStyle = this.paper.style;
    drawerStyle.webkitTransform = transform;
    drawerStyle.transform = transform;

    let transition = '';

    if (mode) {
      transition = this.props.theme.transitions.create(
        'all',
        getTransitionProps(
          {
            timeout: this.props.transitionDuration,
          },
          {
            mode,
          },
        ),
      );
    }

    drawerStyle.webkitTransition = transition;
    drawerStyle.transition = transition;

    if (!this.props.disableBackdropTransition) {
      const backdropStyle = this.backdrop.style;
      backdropStyle.opacity = 1 - translate / this.getMaxTranslate();

      backdropStyle.webkitTransition = transition;
      backdropStyle.transition = transition;
    }
  }

  handleBodyTouchStart = event => {
    // We are not supposed to hanlde this touch move.
    if (nodeHowClaimedTheSwipe !== null && nodeHowClaimedTheSwipe !== this) {
      return;
    }

    const { disableDiscovery, open, swipeAreaWidth } = this.props;
    const anchor = getAnchor(this.props);
    const currentX =
      anchor === 'right'
        ? document.body.offsetWidth - event.touches[0].pageX
        : event.touches[0].pageX;
    const currentY =
      anchor === 'bottom'
        ? window.innerHeight - event.touches[0].clientY
        : event.touches[0].clientY;

    if (!open) {
      if (isHorizontal(this.props)) {
        if (currentX > swipeAreaWidth) {
          return;
        }
      } else if (currentY > swipeAreaWidth) {
        return;
      }
    }

    nodeHowClaimedTheSwipe = this;
    this.startX = currentX;
    this.startY = currentY;

    this.setState({ maybeSwiping: true });
    if (!open) {
      this.setPosition(this.getMaxTranslate() - (disableDiscovery ? 0 : swipeAreaWidth));
    }

    document.body.addEventListener('touchmove', this.handleBodyTouchMove, { passive: false });
    document.body.addEventListener('touchend', this.handleBodyTouchEnd);
    // https://plus.google.com/+PaulIrish/posts/KTwfn1Y2238
    document.body.addEventListener('touchcancel', this.handleBodyTouchEnd);
  };

  handleBodyTouchMove = event => {
    const anchor = getAnchor(this.props);
    const horizontalSwipe = isHorizontal(this.props);

    const currentX =
      anchor === 'right'
        ? document.body.offsetWidth - event.touches[0].pageX
        : event.touches[0].pageX;
    const currentY =
      anchor === 'bottom'
        ? window.innerHeight - event.touches[0].clientY
        : event.touches[0].clientY;

    // We don't know yet.
    if (this.isSwiping === undefined) {
      const dx = Math.abs(currentX - this.startX);
      const dy = Math.abs(currentY - this.startY);

      // If the user has moved his thumb some pixels in either direction,
      // we can safely make an assumption about whether he was intending
      // to swipe or scroll.
      const isSwiping = horizontalSwipe
        ? dx > UNCERTAINTY_THRESHOLD && dy <= UNCERTAINTY_THRESHOLD
        : dy > UNCERTAINTY_THRESHOLD && dx <= UNCERTAINTY_THRESHOLD;

      if (isSwiping) {
        this.isSwiping = this.props.open ? 'closing' : 'opening';

        // Compensate for the part of the drawer displayed on touch start.
        if (!this.props.disableDiscovery) {
          if (horizontalSwipe) {
            this.startX -= this.props.swipeAreaWidth;
          } else {
            this.startY -= this.props.swipeAreaWidth;
          }
        }
      } else if (
        horizontalSwipe
          ? dx <= UNCERTAINTY_THRESHOLD && dy > UNCERTAINTY_THRESHOLD
          : dy <= UNCERTAINTY_THRESHOLD && dx > UNCERTAINTY_THRESHOLD
      ) {
        this.handleBodyTouchEnd(event);
      }
    }

    if (this.isSwiping === undefined) {
      return;
    }

    this.setPosition(this.getTranslate(horizontalSwipe ? currentX : currentY));
  };

  handleBodyTouchEnd = event => {
    nodeHowClaimedTheSwipe = null;
    this.removeBodyTouchListeners();
    this.setState({ maybeSwiping: false });

    if (this.isSwiping === undefined) {
      return;
    }

    const anchor = getAnchor(this.props);
    let current;
    if (isHorizontal(this.props)) {
      current =
        anchor === 'right'
          ? document.body.offsetWidth - event.changedTouches[0].pageX
          : event.changedTouches[0].pageX;
    } else {
      current =
        anchor === 'bottom'
          ? window.innerHeight - event.changedTouches[0].clientY
          : event.changedTouches[0].clientY;
    }
    const translateRatio = this.getTranslate(current) / this.getMaxTranslate();

    // We have to open or close after setting swiping to null,
    // because only then CSS transition is enabled.
    if (translateRatio > 0.5) {
      if (this.isSwiping === 'opening') {
        // Reset the position, the swipe was aborted.
        this.setPosition(this.getMaxTranslate(), {
          mode: 'enter',
        });
      } else {
        this.props.onClose();
      }
    } else if (this.isSwiping === 'opening') {
      this.props.onOpen();
    } else {
      // Reset the position, the swipe was aborted.
      this.setPosition(0, {
        mode: 'exit',
      });
    }

    this.isSwiping = undefined;
  };

  backdrop = null;
  paper = null;
  isSwiping = undefined;
  startX = null;
  startY = null;

  listenTouchStart() {
    document.body.addEventListener('touchstart', this.handleBodyTouchStart);
  }

  removeTouchStart() {
    document.body.removeEventListener('touchstart', this.handleBodyTouchStart);
  }

  removeBodyTouchListeners() {
    document.body.removeEventListener('touchmove', this.handleBodyTouchMove, { passive: false });
    document.body.removeEventListener('touchend', this.handleBodyTouchEnd);
    document.body.removeEventListener('touchcancel', this.handleBodyTouchEnd);
  }

  handleBackdropRef = node => {
    this.backdrop = node ? ReactDOM.findDOMNode(node) : null;
  };

  handlePaperRef = node => {
    this.paper = node ? ReactDOM.findDOMNode(node) : null;
  };

  render() {
    const {
      disableBackdropTransition,
      disableDiscovery,
      ModalProps: { BackdropProps, ...ModalPropsProp } = {},
      onOpen,
      open,
      PaperProps,
      swipeAreaWidth,
      variant,
      ...other
    } = this.props;
    const { maybeSwiping } = this.state;

    return (
      <Drawer
        open={variant === 'temporary' && maybeSwiping ? true : open}
        variant={variant}
        ModalProps={{
          BackdropProps: {
            ...BackdropProps,
            ref: this.handleBackdropRef,
          },
          ...ModalPropsProp,
        }}
        PaperProps={{
          ...PaperProps,
          ref: this.handlePaperRef,
        }}
        {...other}
      />
    );
  }
}

SwipeableDrawer.propTypes = {
  /**
   * @ignore
   */
  anchor: PropTypes.oneOf(['left', 'top', 'right', 'bottom']),
  /**
   * Disable the backdrop transition.
   * This can improve the FPS on low-end devices.
   */
  disableBackdropTransition: PropTypes.bool,
  /**
   * If `true`, touching the screen near the edge of the drawer will not slide in the drawer a bit
   * to promote accidental discovery of the swipe gesture.
   */
  disableDiscovery: PropTypes.bool,
  /**
   * @ignore
   */
  ModalProps: PropTypes.object,
  /**
   * Callback fired when the component requests to be closed.
   *
   * @param {object} event The event source of the callback
   */
  onClose: PropTypes.func.isRequired,
  /**
   * Callback fired when the component requests to be opened.
   *
   * @param {object} event The event source of the callback
   */
  onOpen: PropTypes.func.isRequired,
  /**
   * If `true`, the drawer is open.
   */
  open: PropTypes.bool.isRequired,
  /**
   * @ignore
   */
  PaperProps: PropTypes.object,
  /**
   * The width of the left most (or right most) area in pixels where the
   * drawer can be swiped open from.
   */
  swipeAreaWidth: PropTypes.number,
  /**
   * @ignore
   */
  theme: PropTypes.object.isRequired,
  /**
   * The duration for the transition, in milliseconds.
   * You may specify a single timeout for all transitions, or individually with an object.
   */
  transitionDuration: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.shape({ enter: PropTypes.number, exit: PropTypes.number }),
  ]),
  /**
   * @ignore
   */
  variant: PropTypes.oneOf(['permanent', 'persistent', 'temporary']),
};

SwipeableDrawer.defaultProps = {
  anchor: 'left',
  disableBackdropTransition: false,
  disableDiscovery: false,
  swipeAreaWidth: 20,
  transitionDuration: { enter: duration.enteringScreen, exit: duration.leavingScreen },
  variant: 'temporary', // Mobile first.
};

export default withTheme()(SwipeableDrawer);
