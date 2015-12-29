(() => {
    'use strict';

    /**
     * @ngdoc service
     * @name stateManager
     * @module app.common
     * @requires
     * @description
     *
     * The `stateManager` factory is a service controlling states (true/false) of panels and their content.
     * State object corresponds to either a panel with mutually exclusive content panes, a content pane, or any other element with set content. For simplicity, a state object which is a parent, cannot be a child of another state object.
     *
     * When a parent state object is:
     * - activated: it activates a first (random) child as well; activating a parent state object should be avoided;
     * - deactivated: it deactivates its active child as well;
     *
     * When a child state object is:
     * - activated: it activates its parent and deactivates its active sibling if any;
     * - deactivated: it deactivates its parent as well;
     */
    angular
        .module('app.common.router')
        .factory('stateManager', stateManager);

    // https://github.com/johnpapa/angular-styleguide#factory-and-service-names

    function stateManager($q) {
        const service = {
            addState: addState,
            set: set,
            get: get,
            getMode: getMode,
            setMode: setMode,
            isAnimated: isAnimated,
            resolve: resolve
        };

        // state object
        // sample state object
        let state = {
            main: {
                enabled: false
            },
            mainToc: {
                enabled: false,
                parent: 'main'
            },
            mainToolbox: {
                enabled: false,
                parent: 'main'
            },
            mainDetails: {
                enabled: false,
                parent: 'main'
            },
            side: {
                enabled: false
            },
            sideMetadata: {
                enabled: false,
                parent: 'side'
            },
            sideSettings: {
                enabled: false,
                parent: 'side'
            },
            filters: {
                enabled: false,
                mode: 'default' // half, tenth
            },
            filtersFulldata: {
                enabled: false,
                parent: 'filters'
            },
            filtersNamedata: {
                enabled: false,
                parent: 'filters'
            },
            other: {
                enabled: false
            },
            otherBasemap: {
                enabled: false,
                parent: 'other'
            },
            mapnav: {
                mode: 'default'
            }
        };

        return service;

        ///////////

        /**
         * Adds new items to the state collection with overrride;
         * @param {Array} items an array of state items
         */
        function addState(items) {
            state = angular.merge(state, items);
        }

        /**
         * Sets items states. Items may be supplied as an array of strings or ojects of `{ [itemName]: [targetValue] }` where `itemName` is a String; `targetValue`, a boolean. If the targetValue is not supplied, a negation of the current state is used. After changing state of an item, stateManager waits for state directive to resolve items callback after its transition is completed. This can be used to open toc panel and then metadata panel in sequence.
         *
         * ```js
         * // sideMetadata panel will only be activated when state directive resolved mainToc callback after its transition is complete
         * stateManager.set('mainToc', 'sideMetadata');
         *
         * // same effect as above but using object notation with explicit target values
         * stateManager.set({ mainToc: true }, { sideMetadata: true });
         * ```
         *
         * @param {Array} items state items to toggle
         * @return {Promise} returns a promise which is resolved when animation completes; if the child is supplies as the element to be manipulated and its transition is immediate, the return promise is resovled when its parent animation is complete;
         */
        function set(...items) {
            if (items.length > 0) {

                let after;

                let one = items.shift(); // get first item
                let oneTargetValue;

                // infer name, target state and parent
                if (typeof one === 'string') {
                    one = getItem(one);
                    oneTargetValue = !one.item.enabled; // using negated current state as the target
                } else {
                    let oneName = Object.keys(one)[0];
                    oneTargetValue = one[oneName];
                    one = getItem(oneName);
                }

                //console.log('Setting state item', one.name, 'to', oneTargetValue);
                if (one.item.parent) { // item has a parent

                    let oneParent = getParent(one.name); // get parent
                    if (oneTargetValue) { // item turning on

                        if (!oneParent.item.enabled) { // if parent is off,
                            setItem(one.item, true, true); // turn item on without animation
                            one = oneParent; // and animate parent's opening transition
                        } else { // if parent if on,
                            getChildren(oneParent.name)
                                .forEach(child => {
                                    //console.log('child - ', child);
                                    if (child.name !== one.name) {
                                        setItem(child.item, false); // animate siblings off
                                    }
                                });
                        }

                    } else { // item turning off
                        one = oneParent; // animate parent's closing transition
                        after = () => { // after parent finished its transition
                            getChildren(oneParent.name)
                                .forEach(child => {
                                    //console.log('child - ', child);
                                    setItem(child.item, false, true); // immediately turn off all children
                                });
                        };
                    }

                } else { // item is a parent
                    let oneChildren = getChildren(one.name);

                    // when turning a parent item on, turn on first (random) child
                    if (oneTargetValue && oneChildren.length > 0) { // turning on and with children
                        setItem(oneChildren[0].item, true, true); // immediately turn the first (random) child on without transition
                    } else if (!oneTargetValue) { // turning off
                        after = () => { // after parent finished its transition
                            oneChildren.forEach(child => {
                                //console.log('child - ', child);
                                setItem(child.item, false, true); // immediately turn off all children
                            });
                        };
                    }
                }

                // return promise for easy promise chaining
                return setItem(one.item, oneTargetValue)
                    .then(() => {

                        //console.log('Continue with the rest of state items');
                        // run any `after` function if exists
                        if (after) {
                            after();
                        }

                        // process the rest of the items
                        return set(...items);
                    });
            } else {
                return $q.resolve(true); // return a resolved promise for thenability
            }
        }

        /**
         * Retuns item state.
         * @param  {String|Object} item either state name or object `{ [itemName]: [targetValue] }`
         * @return {Boolean}      value of the specified state
         */
        function get(item) {
            let itemName = typeof item === 'string' ? item : item.name;
            return state[itemName].enabled;
        }

        /**
         * Resolves promise on the item waiting for its transition to complete.
         * @param  {String} itemName name of the state to resolve
         */
        function resolve(itemName) {
            let item = state[itemName];

            //console.log('Resolving state item lock:', itemName); //, item.fulfill);
            if (item.fulfill) {
                item.fulfill();
                delete item.fulfill;
            }
        }

        /**
         * Sets specified item to the provided value; waits for transition to complete
         * @param {Object} item  state object to modify
         * @param {Boolean} value  target state value
         * @param {Boolean} skip skips animation, defaults to false
         */
        function setItem(item, value, skip = false) {
            return $q(fulfill => { // reject is not used

                item.skip = skip; // even if the item has proper state, set its skip value for sanity

                //console.log('settingItem', item, item.enabled, value);
                if (item.enabled !== value) {
                    item.fulfill = fulfill;
                    item.enabled = value;

                    // waititing for items to animate and be resolved
                } else {
                    // resolve immediately
                    fulfill();
                }
            });
        }

        /**
         * Returns item object from itemName specified
         * @param  {String} itemName name of the item
         * @return {Object}          state object and its name
         */
        function getItem(itemName) {
            return {
                name: itemName,
                item: state[itemName]
            };
        }

        /**
         * Returns a parent of the itemName specified
         * @param  {String} itemName name of the state object whose parent will be returned
         * @return {Object}          state object and its name
         */
        function getParent(itemName) {
            let parentName = state[itemName].parent;
            let parent = state[parentName];

            return {
                name: parentName,
                item: parent
            };
        }

        /**
         * Returns array of children of the itemName specified
         * @param  {String} parentName itemName whose children will be returned
         * @return {Object}            an array of state objects and their names
         */
        function getChildren(parentName) {
            return Object.keys(state)
                .filter((key) => {
                    return state[key].parent === parentName;
                })
                .map((key) => {
                    return {
                        name: key,
                        item: state[key]
                    };
                });
        }

        /**
         * Returns the mode of the item specified
         * @param  {String} item       itemName whose mode will be returned
         * @return {String}            the item's mode or null if the item has no mode stored
         */
        function getMode(item) {
            return state[item].mode || null;
        }

        /**
         * Changes the mode of the item to the value specified
         * @param  {String} item       name of the item to change
         * @param  {String} value      value to change the mode to
         * @return {Object}            the stateManager service to use for chaining
         */
        function setMode(item, value) {
            state[item].mode = value;

            return service;
        }

        /**
         * Returns whether transition should be animated or not.
         * @param  {String} item       itemName whose isAnimated value will be returned
         * @return {String}            the item's isAnimated value; defaults to true if skip value is not stored
         */
        function isAnimated(item) {
            // true !== true => false
            // false !== true => true
            // undefined !== true => true
            // null !== true => true
            return state[item].skip !== true;
        }
    }
})();
