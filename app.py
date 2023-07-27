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





app = Flask(__name__, static_folder='static')
login_manager = LoginManager(app)
load_dotenv("password.env")
secret_key = os.environ.get('SECRET_KEY')
app.secret_key = secret_key
#remember to use environmental variable for secret key
#app.secret_key = b'%akoFEKL035/a/5xe2'
@login_manager.user_loader
def load_user(user_id):
    return User.get_by_username(user_id)



@app.route('/login',methods=['POST'])
def login():
    username= request.form['username']
    password= request.form['password']
    #create user object
    user = User.get_by_username(username)
    #check to see if form fields are empty or not
    if not username or not password:
        flash("Please enter information to log in")
        return render_template("index.html")


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
   
   """
   #checking if dod is provided AND its NOT an empty string
   #it checks to see if the key exists and if its value is NOT empty
   if 'death' in data and data['death']:
    #for converting the string into date for mysql
    #date is parsed only when the date string is given and NOT an empty string
    dod_date_obj = datetime.strptime(dod, '%Y-%m-%d').date()
    #if dod is not provided or is an empty string the datetime obj is set to none
   else:
      dod_date_obj = None
   """

   

if __name__== '__main__':
    app.run()