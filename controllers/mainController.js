// Controller for general pages

// Render the manual page
exports.getManual = (req, res) => {
    res.render('manual', {
        title: 'Manual',
        user: req.session.user // Pass user session if needed for header/footer
    });
};

// You could add other general page handlers here, e.g., for the index page if not handled elsewhere
// exports.getIndex = (req, res) => { ... };