from flask import Flask, render_template, json, jsonify, request, session,url_for,flash,redirect
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from dotenv import load_dotenv
import json, os
import bcrypt


class User(UserMixin):
    def __init__ (self, user_id, username, hash_pw):
        self.id = user_id
        self.username = username
        self.hash_pw = hash_pw

    @staticmethod
    def get_by_username(username):
        with open('users.txt','r') as file:
            for line in file:
                file_username, hashed_password = line.strip().split(':')
                if username == file_username:
                    return User(user_id = username, username = username, hash_pw = hashed_password )
        #user not found
        
        return None
    
    def verify_password(self, entered_pw):
        return bcrypt.checkpw(entered_pw.encode('utf-8'), self.hash_pw.encode('utf-8'))




#creating the instance
app = Flask(__name__, static_folder='static')
login_manager = LoginManager(app)
load_dotenv("password.env")
secret_key = os.environ.get('SECRET_KEY')
app.secret_key = secret_key

#logging in the user
@login_manager.user_loader
def load_user(user_id):
    return User.get_by_username(user_id)


#route for adding to the tree
@app.route('/login',methods=['POST'])
def login():
    username= request.form['username']
    password= request.form['password']
    #create user object
    user = User.get_by_username(username)
    #check to see if form fields are empty or not
    if not username or not password:
        flash("Please enter information to log in")
        return redirect(url_for('index'))


    #checking to see if usernames match
    with open('users.txt','r') as file:
        for line in file:
            file_username, hashed_password = line.strip().split(':')
            if user.username == file_username and user.verify_password(password):
                login_user(user) #authenticates for you
                print("user is logged in")
                return render_template("index.html")
            
            
            
    print("Invalid username or password, please try again")
    return render_template("index.html")

@app.route('/logout',methods=['POST'])
@login_required
def logout():
    logout_user()   
    return render_template("index.html")
   
#to display this message instead of default 401 error
#for when a user logs out without already being logged in
@app.errorhandler(401)
def unauthorized(e):
    flash("You are not logged in")
    return redirect(url_for('index'))

#display when user logs in with incorrect info
@app.errorhandler(500)
def incorrect_info(e):
    flash("Incorrect username or password")
    return redirect(url_for('index'))



@app.route('/')
def index():
    title = "Family Tree Website"
    return render_template("index.html", title=title)


#route for displaying the up-to date json file when the website loads
@app.route('/start-up', methods=['GET'])
def get_initial_data():
    try:
        with open('static/nodeData.json','r') as file:
            data = json.load(file)
            return jsonify(data)
    except FileNotFoundError:
            return jsonify([])


#route for adding a person when the button is clicked
@app.route('/', methods=['POST','GET'])
@login_required
def add_person():
    #getting the json data from html/JS and putting it into variable
   data = request.get_json()
   #Getting the json data from html, then assigning specific index elements to variables
   key = data['key']
   n = data['n']  
   dob = data['dob']
   dod = data['dod']
   s = data['s']
   #pic = data['pic']
   

   #need to read the file first to preserve any existing data
   with open('static/nodeData.json','r') as file:
       existing_data = json.load(file)
       
   

   #make dict for new person
   new_person = {
       'key': key,
       'n': n,
       'dob': dob,
       'dod': dod,   
       's': s 
   }

   #convert new_person to list
   new_person = [new_person]

   #iterate and append the contents of the list, NOT the list itself
   for i in new_person:
    existing_data['nodeDataArray'].append(i)
   
   #write to flat file, with statement closes automatically
   with open('static/nodeData.json','w') as file:
       json.dump(existing_data, file, indent = 4)
       
   return jsonify(existing_data['nodeDataArray'])
   

if __name__== '__main__':
    app.run()